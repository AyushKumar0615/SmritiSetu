// FCM HTTP v1 client for the send-fcm-notification Edge Function.
//
// Deliberately free of Deno/npm imports (only fetch + Web Crypto), so it can be
// exercised from any runtime. The Firebase service account is used for exactly
// one thing: signing a short-lived OAuth token request. Neither the private
// key, the OAuth access token nor a device token is ever logged or returned.

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Created by the Android app (src/services/nativePushService.js).
export const REMINDER_CHANNEL_ID = 'smritisetu-reminders';

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  tag?: string;
}

// invalid_token: FCM says this token can never work again (safe to delete).
// auth: our credentials/config are wrong — never delete tokens because of this.
// retryable: transient (rate limit, outage, network).
export type SendResult =
  | { ok: true }
  | { ok: false; kind: 'invalid_token' | 'auth' | 'retryable' | 'other'; code: string };

export class FcmAuthError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = 'FcmAuthError';
    this.code = code;
  }
}

// Reads the whole service-account key JSON held in one Supabase secret.
export function parseServiceAccount(raw: string | null | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    const projectId = typeof json.project_id === 'string' ? json.project_id.trim() : '';
    const clientEmail = typeof json.client_email === 'string' ? json.client_email.trim() : '';
    // Tolerate a key whose newlines were double-escaped when the secret was set.
    const privateKey = typeof json.private_key === 'string' ? json.private_key.replace(/\\n/g, '\n') : '';
    if (!projectId || !clientEmail || !privateKey.includes('BEGIN PRIVATE KEY')) return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '');
  const binary = atob(base64);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) der[i] = binary.charCodeAt(i);
  return der.buffer;
}

async function signJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export function buildFcmRequestBody(message: FcmMessage) {
  return {
    message: {
      token: message.token,
      notification: { title: message.title, body: message.body },
      ...(Object.keys(message.data).length > 0 ? { data: message.data } : {}),
      android: {
        priority: 'HIGH',
        notification: { channel_id: REMINDER_CHANNEL_ID, ...(message.tag ? { tag: message.tag } : {}) }
      }
    }
  };
}

// Error codes are echoed back to the caller, so only well-formed constants pass.
function safeCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Z0-9_]{1,40}$/.test(value) ? value : fallback;
}

export function classifyFcmError(httpStatus: number, body: unknown): Extract<SendResult, { ok: false }> {
  const error = (body as { error?: { status?: unknown; details?: unknown } } | null)?.error;
  const details = Array.isArray(error?.details) ? (error!.details as Array<Record<string, unknown>>) : [];
  const fcmCode = details.find((d) => typeof d?.errorCode === 'string')?.errorCode as string | undefined;
  const status = typeof error?.status === 'string' ? error.status : undefined;
  const badTokenField = details.some(
    (d) => Array.isArray(d?.fieldViolations) && (d.fieldViolations as Array<{ field?: unknown }>).some((v) => typeof v?.field === 'string' && v.field.includes('message.token'))
  );

  // Only an explicit UNREGISTERED (or a violation on the token field itself) means
  // the token is dead. A wrong project/credential must never look like that, or one
  // misconfiguration would wipe every stored token.
  if (fcmCode === 'UNREGISTERED') return { ok: false, kind: 'invalid_token', code: 'UNREGISTERED' };
  if (httpStatus === 400 && badTokenField) return { ok: false, kind: 'invalid_token', code: 'INVALID_TOKEN' };

  if (httpStatus === 401 || httpStatus === 403 || status === 'UNAUTHENTICATED' || status === 'PERMISSION_DENIED' || fcmCode === 'SENDER_ID_MISMATCH' || fcmCode === 'THIRD_PARTY_AUTH_ERROR') {
    return { ok: false, kind: 'auth', code: safeCode(fcmCode ?? status, `HTTP_${httpStatus}`) };
  }
  if (httpStatus === 429 || httpStatus >= 500 || fcmCode === 'QUOTA_EXCEEDED' || fcmCode === 'UNAVAILABLE' || fcmCode === 'INTERNAL') {
    return { ok: false, kind: 'retryable', code: safeCode(fcmCode ?? status, `HTTP_${httpStatus}`) };
  }
  return { ok: false, kind: 'other', code: safeCode(fcmCode ?? status, `HTTP_${httpStatus}`) };
}

export interface FcmClient {
  getAccessToken(): Promise<string>;
  send(message: FcmMessage): Promise<SendResult>;
}

export function createFcmClient(options: {
  serviceAccount: ServiceAccount;
  fetchFn?: typeof fetch;
  now?: () => number;
}): FcmClient {
  const { serviceAccount } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const sendUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.projectId)}/messages:send`;

  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchAccessToken(): Promise<string> {
    let assertion: string;
    try {
      assertion = await signJwt(serviceAccount, Math.floor(now() / 1000));
    } catch {
      throw new FcmAuthError('invalid_private_key');
    }

    let response: Response;
    try {
      response = await fetchFn(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
      });
    } catch {
      throw new FcmAuthError('token_endpoint_unreachable');
    }

    const json = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown; error?: unknown } | null;
    if (!response.ok || typeof json?.access_token !== 'string') {
      throw new FcmAuthError(typeof json?.error === 'string' && /^[a-z_]{1,40}$/.test(json.error) ? json.error : `oauth_http_${response.status}`);
    }

    const lifetimeMs = (typeof json.expires_in === 'number' ? json.expires_in : 3600) * 1000;
    cached = { token: json.access_token, expiresAt: now() + lifetimeMs };
    return json.access_token;
  }

  async function getAccessToken(): Promise<string> {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    if (!inflight) inflight = fetchAccessToken().finally(() => { inflight = null; });
    return inflight;
  }

  async function send(message: FcmMessage): Promise<SendResult> {
    const accessToken = await getAccessToken();

    let response: Response;
    try {
      response = await fetchFn(sendUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildFcmRequestBody(message))
      });
    } catch {
      return { ok: false, kind: 'retryable', code: 'NETWORK_ERROR' };
    }

    if (response.ok) {
      await response.text().catch(() => '');
      return { ok: true };
    }

    const result = classifyFcmError(response.status, await response.json().catch(() => null));
    if (result.kind === 'auth') cached = null; // force a fresh token on the next call
    return result;
  }

  return { getAccessToken, send };
}
