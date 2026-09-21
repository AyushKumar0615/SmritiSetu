-- Caregiver phone number for the Call / Message feature.
--
-- One nullable column on the existing profiles row — the same table the app
-- already uses for a caregiver's name and avatar — so there is a single source
-- of truth and no new table or policy. Stored in E.164 ("+919876543210"), which
-- is what the app hands to the phone's dialer and SMS app; the CHECK keeps
-- anything else out no matter which client writes it.
--
-- Access is unchanged and comes from the existing profiles policies:
--   * "update own profile"       — a caregiver can set/clear only their own number
--   * "select own profile"       — and read it back
--   * "select connected profiles"— a connected elder can read it (that policy also
--     covers pending requests; the app only shows the number once a connection is
--     accepted)
--   * "admin select all profiles"
--
-- Apply this BEFORE shipping the app version that reads/writes profiles.phone.
-- Idempotent: safe to run more than once. Existing rows stay NULL.

alter table public.profiles add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_phone_e164_check;
alter table public.profiles
  add constraint profiles_phone_e164_check
  check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');

comment on column public.profiles.phone is
  'Contact number in E.164 (e.g. +919876543210). Optional. Used for the caregiver Call / Message actions.';
