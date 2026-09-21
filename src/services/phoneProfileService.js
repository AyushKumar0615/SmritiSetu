import { supabase } from './supabaseClient';
import { normalizePhone } from './phoneNumber';
import { CaregiverConnectionService } from './caregiverConnectionService';

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
  },

  // Who the elder's "Call Caregiver" tile should ring: the caregiver connected
  // the longest (accepted connections only) who has a valid number. There is no
  // "primary" flag in the data, so oldest-first is the rule.
  // -> { status: 'found', caregiver: { id, name, phone } }   phone is E.164
  //  | { status: 'no_caregiver' } | { status: 'no_phone' } | { status: 'error' }
  async getPrimaryCaregiverContact(elderId) {
    if (!elderId) return { status: 'no_caregiver' };
    const result = await CaregiverConnectionService.listCaregiversForElder(elderId);
    if (!result.ok) return { status: 'error' };

    const accepted = result.connections
      .filter((c) => c.status === 'accepted' && c.caregiver?.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (accepted.length === 0) return { status: 'no_caregiver' };

    const phones = await this.getPhonesForProfiles(accepted.map((c) => c.caregiver.id));
    for (const c of accepted) {
      const phone = normalizePhone(phones[c.caregiver.id] || '');
      if (phone) return { status: 'found', caregiver: { id: c.caregiver.id, name: c.caregiver.fullName, phone } };
    }
    return { status: 'no_phone' };
  }
};
