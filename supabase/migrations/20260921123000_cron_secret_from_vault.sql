-- send-reminder-push cron auth: read the shared secret from Supabase Vault.
--
-- Supersedes the scheduling block of 20260910000000_reminder_push_notifications.sql,
-- which read the bearer secret from a database setting (app.cron_secret). On this
-- project (Postgres 17, non-superuser `postgres`) that setting cannot be created
-- (`ALTER DATABASE ... SET app.cron_secret` fails with 42501 permission denied),
-- so the job could never authenticate. Vault is Supabase's supported place for a
-- secret a cron job needs, and it keeps the value out of pg_db_role_setting.
--
-- This file contains NO secret. The value lives in two places that must be
-- identical, both set out-of-band (never committed):
--   1. Edge Function secret CRON_SECRET     (supabase secrets set ...)
--   2. Vault secret named 'cron_secret'     (created once, from a trusted session):
--        select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret',
--          'Bearer secret for the send-reminder-push pg_cron job (= Edge secret CRON_SECRET)');
--      To rotate later: set the Edge secret, then
--        select vault.update_secret((select id from vault.secrets where name = 'cron_secret'),
--          '<new value>');
--      and compare the two without printing either (sha256 of the Vault value vs the
--      digest `supabase secrets list` returns for CRON_SECRET).
--
-- Fail-closed: if the Vault secret is missing the job sends an empty bearer, which
-- send-reminder-push rejects with 401 — it never errors out or sends anything.
-- The secret is read on every run, so rotating it takes effect on the next minute
-- without touching the job.
--
-- cron.schedule() with an existing job name updates that job in place, so this is
-- idempotent and safe to run more than once. The guard keeps it a no-op notice on a
-- database where pg_cron / pg_net / Vault are not enabled yet.

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then

    execute $exec$
      select cron.schedule(
        'send-reminder-push',
        '* * * * *',
        $job$
        select net.http_post(
          url := 'https://zsnhtoacqwgnoinbvstp.supabase.co/functions/v1/send-reminder-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1), '')
          ),
          body := '{}'::jsonb
        );
        $job$
      )
    $exec$;

    raise notice 'send-reminder-push cron job now reads its bearer secret from Vault (secret name: cron_secret). Create/verify that Vault secret so it matches the Edge secret CRON_SECRET.';
  else
    raise notice 'pg_cron / pg_net / Vault not all available — the send-reminder-push job was NOT updated. Enable them from the Dashboard (Database -> Extensions), then re-run this migration.';
  end if;
end $outer$;
