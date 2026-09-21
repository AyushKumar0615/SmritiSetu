// send-fcm-notification — Supabase Edge Function
//
// Sends Android reminder notifications through Firebase Cloud Messaging
// (HTTP v1). It complements send-reminder-push (browser Web Push) — it does
// not replace or change that path — and it does NOT schedule anything: a caller
// (the reminder scheduler, wired up in a later step) invokes it.
//
// Request (POST, Authorization: Bearer <CRON_SECRET>, deploy with --no-verify-jwt):
//   { "userIds": ["<uuid>", ...],          // who to notify (elder + accepted caregivers)
//     "reminderId": "<uuid>",              // title/body/data are built from this reminder
//     "tag": "optional collapse key",
//     "dryRun": false }                    // true = report what would be sent, call no FCM
//   or, without a reminder: { "userIds": [...], "title": "...", "body": "...", "data": {...} }
//
// Secrets (Supabase Edge Function secrets only — never in git, frontend code,
// google-services.json or a .env file):
//   FCM_SERVICE_ACCOUNT_JSON  the Firebase service-account key JSON (project_id,
//                             client_email, private_key)
//   CRON_SECRET               shared caller secret, same one send-reminder-push uses
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   injected by Supabase automatically
//
// Reads Android tokens from push_subscriptions (platform = 'android') and, when
// FCM reports a token as UNREGISTERED, deletes that row. Tokens and credentials
// never appear in responses or logs.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createFcmClient, parseServiceAccount } from './fcm.ts';
import { handleRequest, type Db } from './handler.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const db: Db = {
  async getReminder(id) {
    const { data, error } = await supabase.from('reminders').select('id, user_id, title, notes, time').eq('id', id).maybeSingle();
    if (error) throw new Error('reminder_query_failed');
    return data;
  },

  async getAndroidTokens(userIds) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, fcm_token')
      .eq('platform', 'android')
      .not('fcm_token', 'is', null)
      .in('user_id', userIds);
    if (error) throw new Error('subscriptions_query_failed');
    return data ?? [];
  },

  async deleteSubscriptions(ids) {
    const { error } = await supabase.from('push_subscriptions').delete().in('id', ids).eq('platform', 'android');
    if (error) throw new Error('subscriptions_delete_failed');
  }
};

// Created once per isolate so the short-lived Google OAuth token is reused across requests.
const serviceAccount = parseServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON'));
const fcm = serviceAccount ? createFcmClient({ serviceAccount }) : null;

Deno.serve((req: Request) => handleRequest(req, { cronSecret: Deno.env.get('CRON_SECRET'), fcm, db }));
