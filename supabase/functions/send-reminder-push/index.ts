// send-reminder-push — Supabase Edge Function
//
// Invoked once a minute by the pg_cron job set up in
// supabase/migrations/20260910000000_reminder_push_notifications.sql. This
// is the server-side half of the reminder system: the in-app popup
// (src/hooks/useReminderAlerts.js) only runs while a tab/PWA is open, so an
// Android Home Screen PWA that's backgrounded or fully closed needs
// something that runs independently of the browser to notice a reminder is
// due and wake the device via Web Push.
//
// Due-check logic deliberately mirrors src/services/reminderAlertEngine.js
// (same 2-hour "still worth surfacing as missed" grace window, same
// Weekly day-of-week matching) so a reminder means the same thing whether
// it's caught by the open-tab poll or by this function — just evaluated
// against Asia/Kolkata wall-clock time instead of the browser's local
// clock, since that's this app's one implicit timezone (see the comment in
// reminderAlertEngine.js — there's no per-user timezone field to read, and
// this app is built for North Eastern Region India users).
//
// Security: runs with the service-role key (SUPABASE_SERVICE_ROLE_KEY is
// injected automatically by Supabase into every Edge Function — never set
// or read from the frontend). That key is what lets this function read
// across users at all; every other place in this app still goes through
// RLS. The function itself is only reachable by whoever holds CRON_SECRET,
// checked against the Authorization header the cron job sends — deploy
// this function with `--no-verify-jwt` (see the deployment notes handed to
// you separately) since it has no end-user JWT to verify in the first
// place, and rely on this shared-secret check instead.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const IST_TIME_ZONE = 'Asia/Kolkata';
const MISSED_REMINDER_GRACE_MS = 2 * 60 * 60 * 1000; // keep in sync with reminderAlertEngine.js
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getIstParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short'
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24, // Intl can report "24" for midnight
    minute: Number(get('minute')),
    weekday: get('weekday'),
    dateString: `${get('year')}-${get('month')}-${get('day')}`
  };
}

function occursToday(reminder: { repeat_frequency: string; days_of_week: string[] | null }, weekday: string) {
  if (reminder.repeat_frequency !== 'Weekly') return true;
  return (reminder.days_of_week || []).includes(weekday);
}

function isDue(reminder: { time: string; is_active: boolean; is_completed: boolean; repeat_frequency: string; days_of_week: string[] | null }, ist: ReturnType<typeof getIstParts>) {
  if (!reminder.is_active || reminder.is_completed) return false;
  if (!occursToday(reminder, ist.weekday)) return false;

  const [scheduledHour, scheduledMinute] = (reminder.time || '00:00').split(':').map(Number);
  const scheduledTotalMinutes = scheduledHour * 60 + scheduledMinute;
  const nowTotalMinutes = ist.hour * 60 + ist.minute;
  const elapsedMs = (nowTotalMinutes - scheduledTotalMinutes) * 60 * 1000;

  return elapsedMs >= 0 && elapsedMs <= MISSED_REMINDER_GRACE_MS;
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization') || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@example.com';
  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'vapid_not_configured' }), { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const now = new Date();
  const ist = getIstParts(now);

  const { data: reminders, error: remindersError } = await supabase
    .from('reminders')
    .select('id, user_id, title, notes, time, category, icon, repeat_frequency, days_of_week, is_active, is_completed')
    .eq('is_active', true)
    .eq('is_completed', false);

  if (remindersError) {
    return new Response(JSON.stringify({ error: 'reminders_query_failed', detail: remindersError.message }), { status: 500 });
  }

  const dueReminders = (reminders || []).filter((r) => isDue(r, ist));
  if (dueReminders.length === 0) {
    return new Response(JSON.stringify({ ok: true, due: 0 }), { status: 200 });
  }

  const elderIds = [...new Set(dueReminders.map((r) => r.user_id))];

  // Recipients: the elder themselves, plus every caregiver with an ACCEPTED
  // connection to that elder — the exact same relationship the rest of the
  // app already reads/writes through (caregiver_connections), never a new
  // notion of who's allowed to see a reminder.
  const { data: connections, error: connectionsError } = await supabase
    .from('caregiver_connections')
    .select('elder_id, caregiver_id')
    .eq('status', 'accepted')
    .in('elder_id', elderIds);

  if (connectionsError) {
    return new Response(JSON.stringify({ error: 'connections_query_failed', detail: connectionsError.message }), { status: 500 });
  }

  const caregiversByElder = new Map<string, string[]>();
  (connections || []).forEach((c) => {
    const list = caregiversByElder.get(c.elder_id) || [];
    list.push(c.caregiver_id);
    caregiversByElder.set(c.elder_id, list);
  });

  const recipientIds = new Set<string>(elderIds);
  caregiversByElder.forEach((caregiverIds) => caregiverIds.forEach((id) => recipientIds.add(id)));

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('platform', 'web') // Android (FCM) rows have no Web Push endpoint — they're sent by send-fcm-notification
    .in('user_id', [...recipientIds]);

  if (subscriptionsError) {
    return new Response(JSON.stringify({ error: 'subscriptions_query_failed', detail: subscriptionsError.message }), { status: 500 });
  }

  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  (subscriptions || []).forEach((s) => {
    const list = subscriptionsByUser.get(s.user_id) || [];
    list.push(s);
    subscriptionsByUser.set(s.user_id, list);
  });

  let sent = 0;
  let skippedAlreadySent = 0;
  let removedInvalid = 0;

  for (const reminder of dueReminders) {
    const recipientsForThisReminder = new Set<string>([reminder.user_id, ...(caregiversByElder.get(reminder.user_id) || [])]);

    for (const recipientUserId of recipientsForThisReminder) {
      const subs = subscriptionsByUser.get(recipientUserId) || [];
      if (subs.length === 0) continue;

      // Idempotency: claim this (reminder, day, recipient) before sending —
      // if another concurrent/retried run already claimed it, this insert
      // returns no row and we skip, guaranteeing at most one send.
      const { data: claim, error: claimError } = await supabase
        .from('sent_reminder_notifications')
        .insert({ reminder_id: reminder.id, occurrence_date: ist.dateString, recipient_user_id: recipientUserId })
        .select('id')
        .maybeSingle();

      if (claimError || !claim) {
        skippedAlreadySent += 1;
        continue;
      }

      const payload = JSON.stringify({
        title: 'SmritiSetu Reminder',
        body: `${reminder.title}${reminder.notes ? ' — ' + reminder.notes : ''}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `smritisetu-reminder-${reminder.id}-${ist.dateString}`,
        data: { reminderId: reminder.id, time: reminder.time, url: '/' }
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            removedInvalid += 1;
          }
          // Other errors (transient network/service issues) are left as-is
          // — the claim row already exists, so this occurrence won't be
          // retried until tomorrow's occurrence_date, matching "each
          // occurrence triggers exactly once" rather than hammering a
          // failing push service every minute.
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, due: dueReminders.length, sent, skippedAlreadySent, removedInvalid }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
