import { supabase } from './supabaseClient';
import { normalizePhone } from './phoneNumber';

// Reads/writes the phone number on the existing `profiles` row (profiles.phone,
// see supabase/migrations/20260922000000_profiles_phone.sql) — no separate
// table, so there is one source of truth. Who may read a number is decided by
// the existing profiles RLS policies ("select own profile" / "select connected
// profiles"); a caregiver can only ever write their own row ("update own profile").

export const PhoneProfileService = {
  // -> { ok: true, phone: string | null } | { ok: false, error: 'unknown' }
  async getMyPhone(userId) {
    const { data, error } = await supabase.from('profiles').select('phone').eq('id', userId).single();
    if (error) return { ok: false, error: 'unknown' };
    return { ok: true, phone: data?.phone || null };
  },

  // Blank input clears the number.
  // -> { ok: true, phone: string | null } | { ok: false, error: 'invalid_phone' | 'unknown' }
  async saveMyPhone(userId, input) {
    const trimmed = (input || '').trim();
    let phone = null;
    if (trimmed) {
      phone = normalizePhone(trimmed);
      if (!phone) return { ok: false, error: 'invalid_phone' };
    }
    const { error } = await supabase.from('profiles').update({ phone }).eq('id', userId);
    if (error) return { ok: false, error: 'unknown' };
    return { ok: true, phone };
  },

  // Phone numbers of profiles the caller is allowed to see, as { [id]: phone }.
  // Any failure — including the column not existing yet during a rollout —
  // yields an empty map, so the caregiver list itself never breaks over it.
  async getPhonesForProfiles(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (unique.length === 0) return {};
    const { data, error } = await supabase.from('profiles').select('id, phone').in('id', unique);
    if (error) return {};
    return Object.fromEntries((data || []).filter((row) => row.phone).map((row) => [row.id, row.phone]));
  }
};
