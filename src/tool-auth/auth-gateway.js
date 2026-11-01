// plantillas/integracion/sso/auth-gateway.js
// -----------------------------------------------------------------------------
// COPIA ESTE ARCHIVO TAL CUAL. No necesita ajustes.
//
// TU TOOL COMO RELYING PARTY DE OPENID CONNECT.
//
// Hablas DIRECTO con el IdP. El dashboard orquestador no participa en tu login: si
// el dashboard se cae, un auditor sigue pudiendo entrar a tu subdominio y firmar.
// Nadie queda bloqueado por el orquestador, y por eso la autenticacion no vive en
// un gateway central.
//
// Flujo: authorization code + PKCE. El intercambio del code ocurre servidor a
// servidor con el client secret, asi que NINGUN token llega al navegador: el
// navegador solo tiene tu propia cookie de sesion firmada.
//
// Requiere: npm i openid-client@^6   (Node 20+)
// -----------------------------------------------------------------------------
import * as oidc from 'openid-client';
import { randomUUID } from 'node:crypto';
import { createLoginProtection } from './login-protection.js';
import {
  buildCookie,
  clearCookie,
  parseCookies,
  signSession,
  verifySession
} from './session-cookie.js';
import { randomToken, signValue, verifyValue } from './signed-value.js';
import { extractIdpRoles, mapRoles } from './role-mapping.js';

// Vida de la cookie de handshake: un login sin terminar se abandona, no se mantiene
// vivo.
const HANDSHAKE_TTL_SECONDS = 10 * 60;
const HANDSHAKE_COOKIE = 'oidc_handshake';
const HANDSHAKE_PATH = '/auth';

// El discovery es PEREZOSO y cacheado: el IdP es una dependencia externa, y un
// servicio que se niega a arrancar porque el IdP esta un momento inalcanzable
// fallaria su healthcheck y quedaria en reinicio perpetuo. En vez de eso arranca,
// sirve /health, y los logins fallan hasta que el discovery funcione: degradacion,
// no caida.
export function createAuthGateway (config, { now = Date.now, logger = entry => console.log(JSON.stringify(entry)) } = {}) {
  let discovered = null;
  let unavailableUntil = 0;
  const admitLogin = createLoginProtection(now);
  const instanceId = randomUUID();
  const buildSha = /^[a-f0-9]{40}$/.test(process.env.TOOL_BUILD_SHA || '') ? process.env.TOOL_BUILD_SHA : null;
  const retryAfter = () => Math.max(0, Math.ceil((unavailableUntil - now()) / 1000));

  async function providerFetch (...args) {
    if (retryAfter()) throw new Error('AUTH_COOLDOWN');
    try {
      const response = await fetch(...args);
      if (response.status === 429 || response.status >= 500) {
        const raw = response.headers.get('retry-after');
        const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? (Date.parse(raw) - now()) / 1000 : 30;
        const wait = Number.isFinite(seconds) ? Math.min(3600, Math.max(30, seconds)) : 30;
        unavailableUntil = Math.max(unavailableUntil, now() + wait * 1000);
      }
      return response;
    } catch (error) {
      unavailableUntil = Math.max(unavailableUntil, now() + 30000);
      throw error;
    }
  }

  async function discover () {
    if (retryAfter()) throw new Error('AUTH_COOLDOWN');
    if (!discovered) {
      discovered = oidc
        .discovery(config.issuer, config.clientId, config.clientSecret, undefined, { [oidc.customFetch]: providerFetch })
        .then((asConfig) => {
          // openid-client otherwise relies on TLS for tokens received from the token endpoint.
          oidc.enableNonRepudiationChecks(asConfig);
          return asConfig;
        })
        .catch((error) => {
          // A failed discovery may be retried only after the local cooldown.
          discovered = null;
          unavailableUntil = Math.max(unavailableUntil, now() + 30000);
          throw error;
        });
    }
    return discovered;
  }

  function currentSession (req) {
    const jar = parseCookies(req.headers.cookie);
    return verifySession(jar[config.sessionCookieName], config.sessionSecret, nowSeconds());
  }

  async function startLogin (req, res, returnTo) {
    const asConfig = await discover();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = randomToken();
    const nonce = randomToken();

    // Los secretos del handshake viven en una cookie firmada, corta y acotada a
    // /auth, no en memoria del proceso: asi cualquier replica puede completar un
    // login que empezo en otra. Sin esto, escalar a 2 instancias rompe el login de
    // forma intermitente, que es de los bugs mas dificiles de diagnosticar.
    const handshake = signValue(
      { codeVerifier, state, nonce, returnTo, exp: nowSeconds() + HANDSHAKE_TTL_SECONDS },
      config.sessionSecret
    );

    const authorizationUrl = oidc.buildAuthorizationUrl(asConfig, {
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce
    });

    res.setHeader('set-cookie', [
      buildCookie({
        name: HANDSHAKE_COOKIE,
        value: handshake,
        maxAgeSeconds: HANDSHAKE_TTL_SECONDS,
        secure: config.secureCookies,
        path: HANDSHAKE_PATH
      })
    ]);
    redirect(res, authorizationUrl.href);
  }

  async function completeLogin (req, res) {
    const jar = parseCookies(req.headers.cookie);
    const handshake = verifyValue(jar[HANDSHAKE_COOKIE], config.sessionSecret);
    if (!handshake || typeof handshake.exp !== 'number' || handshake.exp <= nowSeconds()) {
      // If the browser cannot retain the handshake cookie, restarting here loops
      // through the IdP indefinitely. Stop and require an explicit new login.
      res.set('cache-control', 'no-store');
      res.setHeader('set-cookie', [clearCookie(HANDSHAKE_COOKIE, config.secureCookies, HANDSHAKE_PATH)]);
      return res.status(400).json({
        error: 'AUTH_LOGIN_EXPIRED',
        message: 'El inicio de sesion vencio o no pudo validarse. Inicia sesion de nuevo.',
        login_url: '/auth/login'
      });
    }

    const limited = admitLogin(`callback:${req.ip || 'unknown'}`);
    if (limited) return res.set('retry-after', String(limited)).status(429).json({ error: 'AUTH_RATE_LIMITED', retry_after_seconds: limited });
    const asConfig = await discover();
    const currentUrl = new URL(req.originalUrl || req.url || '/', config.redirectUri);
    // La libreria verifica el state, el enlace PKCE y, del ID token, la firma, el
    // issuer, la audiencia, el vencimiento y el nonce. Saltarse cualquiera de esos
    // es exactamente como se rompe una relying party — no los desactives.
    const tokens = await oidc.authorizationCodeGrant(asConfig, currentUrl, {
      pkceCodeVerifier: asString(handshake.codeVerifier),
      expectedState: asString(handshake.state),
      expectedNonce: asString(handshake.nonce)
    });

    const claims = tokens.claims();
    if (!claims?.sub) throw new Error('el ID token no trae claim `sub`');

    const roles = mapRoles(extractIdpRoles(claims, config.rolesClaim), config.roleMappings);
    const session = {
      sub: claims.sub,
      name: displayName(claims, claims.sub),
      email: typeof claims.email === 'string' ? claims.email : undefined,
      roles,
      exp: nowSeconds() + config.sessionTtlSeconds
    };

    res.setHeader('set-cookie', [
      buildCookie({
        name: config.sessionCookieName,
        value: signSession(session, config.sessionSecret),
        maxAgeSeconds: config.sessionTtlSeconds,
        secure: config.secureCookies
      }),
      clearCookie(HANDSHAKE_COOKIE, config.secureCookies, HANDSHAKE_PATH)
    ]);
    redirect(res, safeReturnTo(asString(handshake.returnTo)));
  }

  async function logout (req, res) {
    res.setHeader('set-cookie', [
      clearCookie(config.sessionCookieName, config.secureCookies),
      clearCookie(HANDSHAKE_COOKIE, config.secureCookies, HANDSHAKE_PATH)
    ]);
    if (retryAfter()) return res.json({ logged_out: true, message: 'Sesion local cerrada; proveedor temporalmente no disponible.' });
    const limited = admitLogin(`logout:${req.ip || 'unknown'}`);
    if (limited) return res.set('retry-after', String(limited)).status(429).json({ error: 'AUTH_RATE_LIMITED', logged_out: true, retry_after_seconds: limited });

    // Logout iniciado por la RP, best effort: si el IdP no responde ya borramos la
    // sesion local, asi que el usuario queda fuera de TU tool de todas formas.
    if (config.postLogoutRedirectUri) {
      try {
        const asConfig = await discover();
        const endSession = oidc.buildEndSessionUrl(asConfig, {
          post_logout_redirect_uri: config.postLogoutRedirectUri
        });
        return redirect(res, endSession.href);
      } catch {
        return redirect(res, config.postLogoutRedirectUri);
      }
    }
    return redirect(res, '/');
  }

  return {
    currentSession,

    // Manda un navegador sin sesion al IdP conservando a donde iba. Los deep links
    // sobreviven al viaje redondo: quien abre un enlace a /ncs/NC-7 desde un correo
    // aterriza en /ncs/NC-7, no en la portada.
    challenge (req, res) {
      redirect(res, `/auth/login?return_to=${encodeURIComponent(req.originalUrl || '/')}`);
    },

    async handleRoute (req, res, action) {
      const started = now();
      const requestId = randomUUID();
      const phase = ['login', 'callback', 'logout'].includes(action) ? action : 'unknown';
      res.set('x-request-id', requestId);
      res.set('cache-control', 'no-store');
      res.once('finish', () => logger({
        component: 'tool_auth', action: phase, request_id: requestId,
        instance_id: instanceId, build_sha: buildSha,
        http_status: res.statusCode, duration_ms: Math.max(0, now() - started)
      }));
      try {
        switch (action) {
          case 'login': {
            const wait = retryAfter();
            if (wait) return res.set('retry-after', String(wait)).status(503).json({ error: 'AUTH_COOLDOWN', retry_after_seconds: wait });
            const limited = admitLogin(`login:${req.ip || 'unknown'}`);
            if (limited) return res.set('retry-after', String(limited)).status(429).json({ error: 'AUTH_RATE_LIMITED', retry_after_seconds: limited });
            return await startLogin(req, res, safeReturnTo(req.query?.return_to));
          }
          case 'callback':
            return await completeLogin(req, res);
          case 'logout':
            return await logout(req, res);
          default:
            return res.status(404).json({ error: 'not_found' });
        }
      } catch (error) {
        // Log only the allowlisted completion fields above; provider errors may
        // contain request details. Never log codes, cookies, bodies or tokens.
        const wait = retryAfter();
        if (wait) return res.set('retry-after', String(wait)).status(503).json({ error: 'AUTH_COOLDOWN', retry_after_seconds: wait });
        return res.status(502).json({
          error: 'AUTH_UNAVAILABLE',
          message: 'proveedor de identidad no disponible'
        });
      }
    }
  };
}

// Acota una redireccion post-login a una ruta de ESTE origen.
//
// Sin esto, `return_to` es un OPEN REDIRECT: alguien manda un enlace a tu propia
// URL de login (de confianza, con tu dominio) que despues de un inicio de sesion
// real deja al usuario en su sitio. Se rechazan tambien las formas
// protocolo-relativas (`//malo.com`) y con backslash.
export function safeReturnTo (candidate) {
  if (!candidate || typeof candidate !== 'string') return '/';
  if (!candidate.startsWith('/')) return '/';
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return '/';
  return candidate;
}

function displayName (claims, fallback) {
  for (const key of ['name', 'preferred_username', 'email']) {
    const value = claims[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

function asString (value) {
  return typeof value === 'string' ? value : undefined;
}

function nowSeconds () {
  return Math.floor(Date.now() / 1000);
}

function redirect (res, location) {
  res.set('cache-control', 'no-store');
  return res.redirect(302, location);
}

export default { createAuthGateway, safeReturnTo };
