-- Android FCM device tokens (Phase 3A: registration only — nothing here sends).
--
-- push_subscriptions was created for browser Web Push, where endpoint/p256dh/auth
-- are all NOT NULL. An Android device is identified by a single FCM registration
-- token instead, so this migration:
--   1. adds `platform` ('web' | 'android', existing rows become 'web') and `fcm_token`;
--   2. relaxes the three Web Push columns to nullable, and replaces the old
--      "always required" rule with a CHECK that each row is a complete web
--      subscription OR an android token — never a half-filled row;
--   3. makes fcm_token unique (a token belongs to exactly one row / one user);
--   4. adds register_fcm_token(), the only path the app uses to save a token.
--
-- Why an RPC instead of a plain client upsert: a phone can be handed from one
-- account to another (e.g. an elder logs out, a caregiver logs in). The token
-- row still belongs to the first user, and the existing owner-only RLS update
-- policy would (correctly) stop the second user from taking it over — so a
-- plain upsert would fail, and the first user would keep receiving the second
-- user's reminders. The function runs as SECURITY DEFINER, always uses
-- auth.uid() (never a caller-supplied user id), and re-assigns the token to the
-- caller. It is executable by signed-in users only.
--
-- The existing RLS policies are left exactly as they are (owner-only).
-- Idempotent: safe to run more than once. Existing web rows and the web-push
-- client code are unaffected (web upserts still conflict on `endpoint`).

alter table public.push_subscriptions add column if not exists platform text not null default 'web';
alter table public.push_subscriptions add column if not exists fcm_token text;

alter table public.push_subscriptions alter column endpoint drop not null;
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth drop not null;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check check (platform in ('web', 'android'));

alter table public.push_subscriptions drop constraint if exists push_subscriptions_credentials_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_credentials_check check (
    (platform = 'web' and endpoint is not null and p256dh is not null and auth is not null and fcm_token is null)
    or
    (platform = 'android' and fcm_token is not null)
  );

-- Plain (non-partial) unique index so ON CONFLICT (fcm_token) can use it.
-- NULLs are distinct, so the many web rows (fcm_token is null) do not collide.
create unique index if not exists push_subscriptions_fcm_token_key
  on public.push_subscriptions (fcm_token);

create or replace function public.register_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'invalid token' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, platform, fcm_token, last_seen_at)
  values (v_user, 'android', p_token, now())
  on conflict (fcm_token)
  do update set user_id = excluded.user_id, platform = 'android', last_seen_at = now();
end;
$$;

revoke all on function public.register_fcm_token(text) from public;
revoke all on function public.register_fcm_token(text) from anon;
grant execute on function public.register_fcm_token(text) to authenticated;
