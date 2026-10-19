// plantillas/integracion/sso/oidc-config.js
// -----------------------------------------------------------------------------
// COPIA ESTE ARCHIVO TAL CUAL. Solo cambia el valor por defecto de
// `SESSION_COOKIE_NAME` por el nombre de tu tool.
//
// Logto y OIDC usan los mismos campos. Solo desarrollo permite correr sin IdP.
//
// No existe el estado "a medias": si el issuer esta puesto y falta cualquier valor
// requerido, esto LANZA y el proceso NO arranca. Un servicio que parece protegido y
// no lo esta es peor que uno abierto declaradamente.
// -----------------------------------------------------------------------------
import { parseRoleMap } from './role-mapping.js';
import { DEFAULT_SESSION_TTL_SECONDS } from './session-cookie.js';

export class AuthConfigurationError extends Error {
  constructor (message) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

// Devuelve null solamente para desarrollo sin configuracion de identidad.
export function resolveAuthConfig (env = process.env) {
  env = {
    ...env,
    OIDC_ISSUER: env.OIDC_ISSUER?.trim() || env.ISSUER_ENDPOINT?.trim(),
    OIDC_CLIENT_ID: env.OIDC_CLIENT_ID?.trim() || env.APP_ID?.trim(),
    OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET?.trim() || env.APP_SECRETS?.trim()
  };
  const issuerRaw = env.OIDC_ISSUER?.trim();
  if (!issuerRaw) {
    if (env.NODE_ENV === 'production' || env.OIDC_CLIENT_ID || env.OIDC_CLIENT_SECRET) {
      throw new AuthConfigurationError('OIDC_ISSUER o ISSUER_ENDPOINT es obligatorio');
    }
    return null;
  }

  const issuer = parseIssuer(issuerRaw);
  const sessionSecret = required(env.SESSION_SECRET, 'SESSION_SECRET');
  // Un secreto corto vuelve el HMAC forzable; se rechaza en vez de advertir.
  // Generalo con: openssl rand -hex 32
  if (sessionSecret.length < 32) {
    throw new AuthConfigurationError('SESSION_SECRET debe tener al menos 32 caracteres');
  }
  const redirectUri = required(env.OIDC_REDIRECT_URI, 'OIDC_REDIRECT_URI');
  if (env.NODE_ENV === 'production') {
    if (issuer.protocol !== 'https:' || new URL(redirectUri).protocol !== 'https:') {
      throw new AuthConfigurationError('El issuer y callback de produccion requieren HTTPS');
    }
    if (env.SESSION_INSECURE_COOKIES === 'true') {
      throw new AuthConfigurationError('Las cookies de produccion requieren Secure');
    }
  }

  return {
    issuer,
    clientId: required(env.OIDC_CLIENT_ID, 'OIDC_CLIENT_ID'),
    clientSecret: required(env.OIDC_CLIENT_SECRET, 'OIDC_CLIENT_SECRET'),
    // Debe coincidir EXACTO con la URI que el IdP tiene en su lista blanca.
    redirectUri,
    // Normalmente el dashboard: https://<dominio>/
    postLogoutRedirectUri: env.OIDC_POST_LOGOUT_REDIRECT_URI?.trim() || undefined,
    // `roles` no es un scope OIDC estandar, pero es como los proveedores que usamos
    // liberan el claim de roles.
    scopes: env.OIDC_SCOPES?.trim() || 'openid profile email roles',
    rolesClaim: env.OIDC_ROLES_CLAIM?.trim() || 'roles',
    roleMappings: parseRoleMap(env.ROLE_MAP),
    sessionSecret,
    // CAMBIA ESTE DEFAULT por el de tu tool, p. ej. `nc_session`. Que cada tool use
    // un nombre propio evita que dos cookies distintas se pisen si algun dia
    // alguien las acota mal al dominio padre.
    sessionCookieName: env.SESSION_COOKIE_NAME?.trim() || 'tool_session',
    sessionTtlSeconds: positiveInt(env.SESSION_TTL_SECONDS) ?? DEFAULT_SESSION_TTL_SECONDS,
    // Solo se apaga para desarrollo local sobre HTTP plano.
    secureCookies: env.SESSION_INSECURE_COOKIES !== 'true'
  };
}

function parseIssuer (raw) {
  try {
    return new URL(raw);
  } catch {
    throw new AuthConfigurationError('OIDC_ISSUER no es una URL valida');
  }
}

function required (value, name) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new AuthConfigurationError(`${name} es obligatorio cuando OIDC_ISSUER esta puesto`);
  }
  return trimmed;
}

function positiveInt (value) {
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default { resolveAuthConfig, AuthConfigurationError };
