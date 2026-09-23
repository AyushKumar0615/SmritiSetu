import { supabase } from './supabaseClient';

const KNOWN_ERROR_CODES = [
  'invalid_code',
  'self_connection',
  'already_connected',
  'already_pending',
  'not_caregiver',
  'not_elder'
];

function mapRpcError(error) {
  const code = (error?.message || '').trim();
  return KNOWN_ERROR_CODES.includes(code) ? code : 'unknown';
}

function toProfileSummary(row) {
  if (!row) return null;
  return { id: row.id, fullName: row.full_name || '', avatar: row.avatar || null };
}

function toConnection(row, viewerRole) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    caregiver: viewerRole === 'elder' ? toProfileSummary(row.caregiver) : undefined,
    elder: viewerRole === 'caregiver' ? toProfileSummary(row.elder) : undefined
  };
}

export const CaregiverConnectionService = {
  // Error codes this service can return, for translation by the caller:
  // 'invalid_code' | 'self_connection' | 'already_connected' | 'already_pending'
  // | 'not_caregiver' | 'not_elder' | 'unknown'

  async getMyConnectionCode(userId) {
    const { data, error } = await supabase.from('profiles').select('connection_code').eq('id', userId).single();
    if (error) return { ok: false, error: 'unknown' };
    if (data?.connection_code) return { ok: true, code: data.connection_code };
    return this.regenerateCode();
  },

  async regenerateCode() {
    const { data, error } = await supabase.rpc('regenerate_connection_code');
    if (error) return { ok: false, error: mapRpcError(error) };
    return { ok: true, code: data };
  },

  async listCaregiversForElder(elderId) {
    const { data, error } = await supabase
      .from('caregiver_connections')
      .select('id, status, created_at, updated_at, caregiver:profiles!caregiver_connections_caregiver_id_fkey(id, full_name, avatar)')
      .eq('elder_id', elderId)
      .order('created_at', { ascending: false });
    if (error) return { ok: false, error: 'unknown' };
    return { ok: true, connections: (data || []).map((row) => toConnection(row, 'elder')) };
  },

  async listEldersForCaregiver(caregiverId) {
    const { data, error } = await supabase
      .from('caregiver_connections')
      .select('id, status, created_at, updated_at, elder:profiles!caregiver_connections_elder_id_fkey(id, full_name, avatar)')
      .eq('caregiver_id', caregiverId)
      .order('created_at', { ascending: false });
    if (error) return { ok: false, error: 'unknown' };
    return { ok: true, connections: (data || []).map((row) => toConnection(row, 'caregiver')) };
  },

  async requestConnection(code) {
    const trimmed = (code || '').trim();
    if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'invalid_code' };
    const { data, error } = await supabase.rpc('request_caregiver_connection', { p_code: trimmed });
    if (error) return { ok: false, error: mapRpcError(error) };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, elderId: row?.elder_id, elderName: row?.elder_name, connectionId: row?.connection_id };
  },

  async respondToRequest(connectionId, status) {
    const { data, error } = await supabase
      .from('caregiver_connections')
      .update({ status })
      .eq('id', connectionId)
      .select('id, status, created_at, updated_at, caregiver:profiles!caregiver_connections_caregiver_id_fkey(id, full_name, avatar)')
      .single();
    if (error) return { ok: false, error: 'unknown' };
    return { ok: true, connection: toConnection(data, 'elder') };
  },

  // Removes only the connection row (elder<->caregiver link) — the `on
  // delete cascade` on caregiver_connections.elder_id/caregiver_id only
  // fires the other way (a deleted profile drops its connections), so this
  // can never delete a profile. Wrapped in try/catch so a thrown network/
  // client error surfaces as a normal { ok:false } result instead of an
  // unhandled rejection that would leave the caller's UI stuck.
  async disconnect(connectionId) {
    if (!connectionId) return { ok: false, error: 'unknown' };
    try {
      const { error } = await supabase.from('caregiver_connections').delete().eq('id', connectionId);
      if (error) return { ok: false, error: 'unknown' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'unknown' };
    }
  }
};
