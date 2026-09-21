// Request handling for send-fcm-notification (Android reminders via FCM HTTP v1).
//
// Server-to-server only: the caller (the reminder scheduler, next step) proves
// itself with the same CRON_SECRET bearer send-reminder-push already uses, and
// the function must be deployed with `--no-verify-jwt`. It is handed WHO to
// notify (userIds, already resolved by the caller — the elder plus accepted
// caregivers) and WHICH reminder; it reads the Android tokens itself and never
// returns or logs them.
//
// The Web Push path is untouched and separate: this only reads rows with
// platform = 'android'.
import { FcmAuthError, type FcmClient, type FcmMessage, type SendResult } from './fcm.ts';

export interface ReminderRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  time: string;
}

export interface AndroidSubscription {
  id: string;
  user_id: string;
  fcm_token: string;
}

export interface Db {
  getReminder(id: string): Promise<ReminderRow | null>;
  getAndroidTokens(userIds: string[]): Promise<AndroidSubscription[]>;
  deleteSubscriptions(ids: string[]): Promise<void>;
}

export interface Deps {
  cronSecret: string | undefined;
  fcm: FcmClient | null; // null = FCM_SERVICE_ACCOUNT_JSON missing or unusable
  db: Db;
}

const MAX_USER_IDS = 200;
const MAX_TOKENS = 1000;
const SEND_CONCURRENCY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Constant-time comparison so the secret can't be probed by response timing.
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

interface ValidRequest {
  userIds: string[];
  reminderId: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, string>;
  tag: string | null;
  dryRun: boolean;
}

function validate(input: unknown): { ok: true; value: ValidRequest } | { ok: false; detail: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, detail: 'body must be a JSON object' };
  const raw = input as Record<string, unknown>;

  if (!Array.isArray(raw.userIds) || raw.userIds.length === 0 || raw.userIds.length > MAX_USER_IDS) {
    return { ok: false, detail: `userIds must be a non-empty array of at most ${MAX_USER_IDS} ids` };
  }
  if (!raw.userIds.every((id) => typeof id === 'string' && UUID.test(id))) return { ok: false, detail: 'userIds must all be UUIDs' };

  let reminderId: string | null = null;
  if (raw.reminderId !== undefined && raw.reminderId !== null) {
    if (typeof raw.reminderId !== 'string' || !UUID.test(raw.reminderId)) return { ok: false, detail: 'reminderId must be a UUID' };
    reminderId = raw.reminderId;
  }

  let title: string | null = null;
  let body: string | null = null;
  if (!reminderId) {
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 100) return { ok: false, detail: 'title (max 100 chars) is required when reminderId is not given' };
    if (typeof raw.body !== 'string' || !raw.body.trim() || raw.body.length > 500) return { ok: false, detail: 'body (max 500 chars) is required when reminderId is not given' };
    title = raw.title;
    body = raw.body;
  }

  const data: Record<string, string> = {};
  if (raw.data !== undefined) {
    if (typeof raw.data !== 'object' || raw.data === null || Array.isArray(raw.data)) return { ok: false, detail: 'data must be an object of strings' };
    const entries = Object.entries(raw.data as Record<string, unknown>);
    if (entries.length > 10) return { ok: false, detail: 'data may have at most 10 keys' };
    for (const [key, value] of entries) {
      // FCM rejects keys that start with google / gcm / from.
      if (!/^[A-Za-z0-9_]{1,40}$/.test(key) || /^(google|gcm|from)/i.test(key)) return { ok: false, detail: 'data has an invalid key' };
      if (typeof value !== 'string' || value.length > 500) return { ok: false, detail: 'data values must be strings of at most 500 chars' };
      data[key] = value;
    }
  }

  let tag: string | null = null;
  if (raw.tag !== undefined && raw.tag !== null) {
    if (typeof raw.tag !== 'string' || raw.tag.length > 100) return { ok: false, detail: 'tag must be a string of at most 100 chars' };
    tag = raw.tag;
  }

  if (raw.dryRun !== undefined && typeof raw.dryRun !== 'boolean') return { ok: false, detail: 'dryRun must be a boolean' };

  return { ok: true, value: { userIds: [...new Set(raw.userIds as string[])], reminderId, title, body, data, tag, dryRun: raw.dryRun === true } };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (!deps.cronSecret || !safeEqual(req.headers.get('Authorization') || '', `Bearer ${deps.cronSecret}`)) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = validate(payload);
  if (!parsed.ok) return json({ error: 'invalid_request', detail: parsed.detail }, 400);
  const request = parsed.value;

  // Same wording and shape as the Web Push payload in send-reminder-push, so a
  // reminder reads identically on every platform.
  let title = request.title ?? '';
  let body = request.body ?? '';
  let data: Record<string, string> = { ...request.data };
  if (request.reminderId) {
    let reminder: ReminderRow | null;
    try {
      reminder = await deps.db.getReminder(request.reminderId);
    } catch {
      return json({ error: 'reminder_query_failed' }, 500);
    }
    if (!reminder) return json({ error: 'reminder_not_found' }, 404);
    title = 'SmritiSetu Reminder';
    body = `${reminder.title}${reminder.notes ? ' — ' + reminder.notes : ''}`;
    data = { ...data, type: 'reminder', reminderId: reminder.id, time: reminder.time };
  }
  const tag = request.tag ?? (request.reminderId ? `smritisetu-reminder-${request.reminderId}` : undefined);

  let subscriptions: AndroidSubscription[];
  try {
    subscriptions = await deps.db.getAndroidTokens(request.userIds);
  } catch {
    return json({ error: 'subscriptions_query_failed' }, 500);
  }
  const seen = new Set<string>();
  const targets = subscriptions.filter((s) => {
    if (!s.fcm_token || seen.has(s.fcm_token)) return false;
    seen.add(s.fcm_token);
    return true;
  });
  if (targets.length > MAX_TOKENS) return json({ error: 'too_many_recipients' }, 400);

  const summary = { recipients: request.userIds.length, tokens: targets.length };

  if (targets.length === 0) {
    return json({ ok: true, ...summary, sent: 0, failed: 0, removedInvalid: 0, failures: {} });
  }
  if (request.dryRun) {
    return json({ ok: true, dryRun: true, ...summary, wouldSend: targets.length, notification: { title, body, dataKeys: Object.keys(data), tag } });
  }
  if (!deps.fcm) return json({ error: 'fcm_not_configured' }, 500);

  try {
    await deps.fcm.getAccessToken();
  } catch (error) {
    return json({ error: 'fcm_auth_failed', code: error instanceof FcmAuthError ? error.code : 'unknown' }, 502);
  }

  const fcm = deps.fcm;
  let aborted: string | null = null;
  const outcomes = await mapPool(targets, SEND_CONCURRENCY, async (target): Promise<SendResult | null> => {
    if (aborted) return null;
    const message: FcmMessage = { token: target.fcm_token, title, body, data, tag };
    try {
      const result = await fcm.send(message);
      if (!result.ok && result.kind === 'auth') aborted = result.code;
      return result;
    } catch (error) {
      aborted = error instanceof FcmAuthError ? error.code : 'unknown';
      return null;
    }
  });

  let sent = 0;
  let failed = 0;
  const failures: Record<string, number> = {};
  const deadIds: string[] = [];
  outcomes.forEach((outcome, index) => {
    if (outcome === null) return;
    if (outcome.ok) {
      sent += 1;
      return;
    }
    failed += 1;
    failures[outcome.code] = (failures[outcome.code] ?? 0) + 1;
    if (outcome.kind === 'invalid_token') deadIds.push(targets[index].id);
  });

  // Only tokens FCM itself declared dead are removed; the users can re-register
  // on their next app launch.
  let removedInvalid = 0;
  if (deadIds.length > 0) {
    try {
      await deps.db.deleteSubscriptions(deadIds);
      removedInvalid = deadIds.length;
    } catch {
      failures.PRUNE_FAILED = deadIds.length;
    }
  }

  console.info('[send-fcm]', JSON.stringify({ ...summary, sent, failed, removedInvalid, aborted: aborted !== null }));

  if (aborted) {
    return json({ ok: false, error: 'fcm_rejected_credentials', code: aborted, ...summary, sent, failed, removedInvalid, failures }, 502);
  }
  return json({ ok: true, ...summary, sent, failed, removedInvalid, failures });
}
