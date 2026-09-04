import crypto from 'node:crypto';

// The wire half of the usage meter: PKCE, the token endpoint, and GET /api/oauth/usage, which is
// the only place exact numbers exist. It needs an OAuth bearer, so the app runs its own login
// against Claude Code's public client rather than reading the CLI's keychain item - that one
// rotates, and every rotation would be another keychain prompt.
//
// Nothing here imports Electron or touches disk, which is what makes the protocol testable
// (test/usage.test.js). The endpoints are undocumented, so a drift is a one-line fix in here.

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
// The manual callback: the consent page prints the code for you to paste back. A loopback
// redirect would spare the paste, but only if this client allows one, and it is not ours.
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPE = 'org:create_api_key user:profile user:inference';
const TOKEN_URLS = ['https://api.anthropic.com/v1/oauth/token', 'https://platform.claude.com/v1/oauth/token'];
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA_HEADER = 'oauth-2025-04-20';
// The real client's own name. An unfamiliar one draws a much more aggressive 429.
const USER_AGENT = 'claude-code/2.1.181';
const TIMEOUT_MS = 15000;

export class OAuthError extends Error {
  constructor(kind, status = null) {
    super(messageFor(kind, status));
    this.kind = kind;
    this.status = status;
  }
}

function messageFor(kind, status) {
  switch (kind) {
    case 'rateLimited': return "Claude's sign-in service is rate-limited. Wait a minute and try again.";
    case 'decode': return 'The sign-in response could not be read.';
    case 'authRevoked': return 'Claude rejected the code. Connect again.';
    default: return status ? `Could not reach the sign-in service (HTTP ${status}).` : 'Could not reach the sign-in service.';
  }
}

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

export function pkce() {
  const verifier = base64url(crypto.randomBytes(32));
  return { verifier, challenge: base64url(crypto.createHash('sha256').update(verifier).digest()) };
}

// `state` is the verifier itself, which is unusual and is what this flow expects.
export function authorizeUrl(challenge, state) {
  const url = new URL(AUTHORIZE_URL);
  for (const [key, value] of Object.entries({
    code: 'true', client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI,
    scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', state,
  })) url.searchParams.set(key, value);
  return url.toString();
}

// The consent page hands back `<code>#<state>`.
export function splitCode(pasted) {
  const text = (pasted || '').trim();
  const hash = text.indexOf('#');
  return hash === -1 ? { code: text, state: '' } : { code: text.slice(0, hash), state: text.slice(hash + 1) };
}

export function decodeToken(body, previousRefresh) {
  if (!body || typeof body.access_token !== 'string' || !body.access_token) return null;
  const lifetime = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  const rotated = typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null;
  return {
    access: body.access_token,
    refresh: rotated || previousRefresh || '',
    expiresAt: Date.now() + lifetime * 1000,
  };
}

// One entry per usage window, or null: a window this account does not have is absent rather than
// zero, because zero is a real reading and would draw an empty bar meaning "plenty left".
export function decodeUsage(body) {
  const bucket = (key) => {
    const found = body?.[key];
    if (!found || typeof found.utilization !== 'number') return null;
    const resets = typeof found.resets_at === 'string' ? Date.parse(found.resets_at) : NaN;
    return {
      utilization: Math.min(100, Math.max(0, found.utilization)),
      resetsAt: Number.isFinite(resets) ? resets : null,
    };
  };
  return {
    fiveHour: bucket('five_hour'),
    sevenDay: bucket('seven_day'),
    sevenDayOpus: bucket('seven_day_opus'),
    sevenDaySonnet: bucket('seven_day_sonnet'),
  };
}

// 200 wins; 400 and 401 are a dead grant and stop the walk; anything else tries the next host.
async function postToken(body, previousRefresh) {
  let last = new OAuthError('unreachable');
  let rateLimited = false;
  for (const url of TOKEN_URLS) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      last = new OAuthError('unreachable');
      continue;
    }
    if (response.status === 200) {
      const token = decodeToken(await response.json().catch(() => null), previousRefresh);
      if (!token) throw new OAuthError('decode');
      return token;
    }
    if (response.status === 400 || response.status === 401) throw new OAuthError('authRevoked', response.status);
    if (response.status === 429) { rateLimited = true; continue; }
    last = new OAuthError('unreachable', response.status);
  }
  throw rateLimited ? new OAuthError('rateLimited', 429) : last;
}

export const exchange = (code, state, verifier) => postToken({
  code, state, grant_type: 'authorization_code',
  client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code_verifier: verifier,
}, null);

export const refresh = (token) => postToken({
  grant_type: 'refresh_token', refresh_token: token.refresh, client_id: CLIENT_ID,
}, token.refresh);

async function getUsage(access) {
  let response;
  try {
    response = await fetch(USAGE_URL, {
      headers: {
        authorization: `Bearer ${access}`, 'anthropic-beta': BETA_HEADER,
        accept: 'application/json', 'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { kind: 'failed' };
  }
  if (response.status === 200) return { kind: 'usage', usage: decodeUsage(await response.json().catch(() => null)) };
  if (response.status === 401 || response.status === 403) return { kind: 'unauthorized' };
  if (response.status === 429) {
    const after = parseFloat(response.headers.get('retry-after'));
    return { kind: 'rateLimited', retryAfter: Number.isFinite(after) ? after : null };
  }
  return { kind: 'failed' };
}

// One reading, with one refresh before the call when the token is nearly out and one after a 401.
// A rotated token comes back as `rotated` so the caller can persist it; this module stores nothing.
export async function readUsage(token) {
  let current = token;
  let rotated = null;
  const renew = async () => {
    current = await refresh(current);
    rotated = current;
  };

  if (Date.now() + 300000 >= current.expiresAt) {
    try { await renew(); } catch (error) { return dead(error, rotated); }
  }

  let result = await getUsage(current.access);
  if (result.kind === 'unauthorized') {
    try { await renew(); } catch (error) { return dead(error, rotated); }
    result = await getUsage(current.access);
  }
  return { ...result, rotated };
}

const dead = (error, rotated) =>
  (error.kind === 'authRevoked' ? { kind: 'authRevoked', rotated: null } : { kind: 'failed', rotated });
