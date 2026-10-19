import assert from 'node:assert/strict'
import { resolveAuthConfig } from '../src/tool-auth/oidc-config.js'
import { resolveAuthConfig as templateConfig } from '../plantillas/integracion/sso/oidc-config.js'
import { resolveAuthConfig as coreConfig } from '../src/auth/oidc-config.js'

const logto = Object.freeze({ NODE_ENV: 'production', ISSUER_ENDPOINT: 'https://tenant.fixture.invalid/oidc', APP_ID: 'fixture-app', APP_SECRETS: 'fixture-client-secret', SESSION_SECRET: 'fixture-session-secret-at-least-32-characters', OIDC_REDIRECT_URI: 'https://cpa.orcalabs.mx/auth/callback', SESSION_COOKIE_NAME: 'cpa_session' })
for (const resolve of [resolveAuthConfig, templateConfig]) {
  assert.equal(resolve({}), null, 'development may run without an IdP')
  assert.throws(() => resolve({ NODE_ENV: 'production' }), /ISSUER/)
  assert.throws(() => resolve({ APP_ID: 'partial' }), /ISSUER/)
  const config = resolve(logto)
  assert.equal(config.issuer.href, logto.ISSUER_ENDPOINT)
  assert.equal(config.clientId, logto.APP_ID)
  assert.equal(config.clientSecret, logto.APP_SECRETS)
  assert.equal(config.sessionCookieName, 'cpa_session')
  assert.equal(config.secureCookies, true)
  assert.equal(config.scopes, 'openid profile email roles')
  assert.equal(resolve({ ...logto, OIDC_ISSUER: ' ', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: ' ' }).clientId, logto.APP_ID)
  const preferred = resolve({ ...logto, OIDC_ISSUER: 'https://explicit.fixture.invalid/oidc', OIDC_CLIENT_ID: 'explicit-app', OIDC_CLIENT_SECRET: 'explicit-client-secret' })
  assert.equal(preferred.issuer.hostname, 'explicit.fixture.invalid')
  assert.equal(preferred.clientId, 'explicit-app')
  assert.equal(preferred.clientSecret, 'explicit-client-secret')
  for (const field of ['APP_ID', 'APP_SECRETS', 'SESSION_SECRET', 'OIDC_REDIRECT_URI']) {
    assert.throws(() => resolve({ ...logto, [field]: '' }), undefined, `${field} cannot be missing`)
  }
  assert.throws(() => resolve({ ...logto, SESSION_SECRET: 'short' }), /32/)
  assert.throws(() => resolve({ ...logto, SESSION_INSECURE_COOKIES: 'true' }), /Secure/)
  assert.throws(() => resolve({ ...logto, ISSUER_ENDPOINT: 'http://tenant.fixture.invalid/oidc' }), /HTTPS/)
  assert.throws(() => resolve({ ...logto, OIDC_REDIRECT_URI: 'http://cpa.orcalabs.mx/auth/callback' }), /HTTPS/)
  assert.equal(Object.hasOwn(logto, 'OIDC_ISSUER'), false, 'configuration never mutates the environment')
}
const invalidIssuer = 'fixture-sensitive-value-not-a-url'
for (const resolve of [resolveAuthConfig, templateConfig, coreConfig]) {
  assert.throws(() => resolve({ OIDC_ISSUER: invalidIssuer }), error => error.message.includes('URL') && !error.message.includes(invalidIssuer), 'invalid issuer errors must not echo environment values')
}
console.log('SSO configuration: Logto aliases, OIDC precedence, partial config, required production SSO and secure cookies PASS')
