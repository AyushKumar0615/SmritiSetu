-- Table privileges for the server-side reminder pipeline (service_role).
--
-- The Edge Functions send-reminder-push and send-fcm-notification run with the
-- service-role key. That role bypasses row-level security, but it still needs
-- ordinary table GRANTs, and this project has none for it on any app table
-- (tables here are only granted to `authenticated` by their own migrations).
-- Without these, every token/reminder lookup fails with "permission denied" and
-- send-fcm-notification answers 500 subscriptions_query_failed.
--
-- Least privilege: exactly what those two functions do, nothing more.
--   push_subscriptions          read the recipients' devices; delete tokens that
--                               Web Push / FCM report as gone
--   reminders                   find the reminders that are due / load one
--   caregiver_connections       resolve accepted caregivers of an elder
--   sent_reminder_notifications the once-per-occurrence claim (insert ... returning)
--
-- No change for anon / authenticated, and no policy changes: sent_reminder_notifications
-- stays closed to app users, and RLS on the other tables is untouched.
-- Idempotent: GRANT is safe to run more than once.

grant select, delete on public.push_subscriptions to service_role;
grant select on public.reminders to service_role;
grant select on public.caregiver_connections to service_role;
grant select, insert on public.sent_reminder_notifications to service_role;
