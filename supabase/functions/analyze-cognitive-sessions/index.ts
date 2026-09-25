// analyze-cognitive-sessions — authenticated, caregiver-scoped AI analysis.
// OPENAI_API_KEY is read only from Supabase Edge Function secrets. It must
// never be copied to .env.local, VITE_* variables, or frontend source.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

type GameSession = {
  game_id: string;
  domain: string;
  score: number;
  accuracy: number;
  best_streak: number;
  difficulty_level: number;
  completion_time_seconds: number | null;
  completed_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const responseSchema = {
  name: 'cognitive_caregiver_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'observations', 'recommended_action', 'data_sufficiency', 'safety_note'],
    properties: {
      summary: { type: 'string' },
      observations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'evidence'],
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            evidence: { type: 'string' }
          }
        }
      },
      recommended_action: { type: 'string' },
      data_sufficiency: { type: 'string' },
      safety_note: { type: 'string' }
    }
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) return json({ error: 'unauthorized' }, 401);

  let body: { sessionId?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_request' }, 400); }
  if (!body.sessionId) return json({ error: 'session_id_required' }, 400);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) return json({ error: 'server_not_configured' }, 500);

  // Resolve the caller from the submitted JWT; never trust an ID supplied by
  // the browser as evidence of caregiver authorization.
  const authClient = createClient(url, anonKey);
  // Pass the extracted bearer token directly. In an Edge runtime there is no
  // persisted Auth session; relying on a client-global header can cause
  // getUser() to resolve a different/no session.
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(url, serviceRoleKey);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', authData.user.id)
    .single();
  const callerRole = String(profile?.role || '').trim().toLowerCase();
  if (profileError || profile?.is_active === false || !['elderly', 'caregiver'].includes(callerRole)) {
    console.warn('cognitive analysis authorization rejected: caller profile');
    return json({ error: 'caller_profile_forbidden' }, 403);
  }

  const { data: targetSession, error: sessionLookupError } = await admin
    .from('game_sessions')
    .select('id, user_id, analysis_status, analysis, analysis_started_at')
    .eq('id', body.sessionId)
    .single();
  if (sessionLookupError || !targetSession) return json({ error: 'session_not_found' }, 404);

  // Owning the session is always sufficient, regardless of the caller's
  // profile role. Without this check first, a profile whose role happens to
  // be 'caregiver' could never analyse its own game session: the old code
  // fell straight into the caregiver_connections lookup below, which can
  // never find a row for caller_id === elder_id (self-links are blocked by
  // the caregiver_connections_no_self_link constraint), so it 403'd every
  // time. The connection lookup is only needed for a caregiver requesting
  // someone else's (an elder's) session.
  const isOwnSession = targetSession.user_id === authData.user.id;
  if (!isOwnSession) {
    if (callerRole !== 'caregiver') {
      console.warn('cognitive analysis authorization rejected: session owner mismatch');
      return json({ error: 'session_owner_mismatch' }, 403);
    }
    const { data: connection, error: connectionError } = await admin
      .from('caregiver_connections')
      .select('id')
      .eq('caregiver_id', authData.user.id)
      .eq('elder_id', targetSession.user_id)
      .eq('status', 'accepted')
      .maybeSingle();
    if (connectionError) return json({ error: 'connection_lookup_failed' }, 500);
    if (!connection) {
      console.warn('cognitive analysis authorization rejected: caregiver connection');
      return json({ error: 'caregiver_not_connected' }, 403);
    }
  }

  // A completed analysis is immutable for this session. A conditional update
  // claims retries atomically so duplicate client calls cannot produce a
  // second provider request for the same game result.
  if (targetSession.analysis_status === 'ready' && targetSession.analysis) {
    return json({ status: 'ready', analysis: targetSession.analysis });
  }
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const claimQuery = admin
    .from('game_sessions')
    .update({ analysis_status: 'processing', analysis_error: null, analysis_started_at: new Date().toISOString() })
    .eq('id', targetSession.id);
  const { data: claimed, error: claimError } = targetSession.analysis_status === 'processing'
    ? await claimQuery.lt('analysis_started_at', staleBefore).select('id').maybeSingle()
    : await claimQuery.in('analysis_status', ['pending', 'failed']).select('id').maybeSingle();
  if (claimError) return json({ error: 'analysis_claim_failed' }, 500);
  if (!claimed) return json({ status: 'processing' });

  const markFailed = (code: string) => admin
    .from('game_sessions')
    .update({ analysis_status: 'failed', analysis_error: code })
    .eq('id', targetSession.id);

  const { data: sessions, error: sessionsError } = await admin
    .from('game_sessions')
    .select('game_id, domain, score, accuracy, best_streak, difficulty_level, completion_time_seconds, completed_at')
    .eq('user_id', targetSession.user_id)
    .order('completed_at', { ascending: false })
    .limit(100);
  if (sessionsError || !sessions?.length) {
    await markFailed('sessions_query_failed');
    return json({ error: 'sessions_query_failed' }, 500);
  }

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    await markFailed('ai_not_configured');
    return json({ error: 'ai_not_configured' }, 503);
  }

  const prompt = {
    sessions: sessions as GameSession[],
    instructions: [
      'Analyse only the supplied game-session data.',
      'Write a concise, supportive, non-diagnostic caregiver summary.',
      'Identify patterns across score, accuracy, domain, difficulty, streak, and completion time.',
      'State uncertainty when history is limited; do not infer disease, decline, or a medical condition.',
      'Give one practical, non-medical caregiver action.',
      'Each observation must cite concrete evidence from the supplied data.'
    ]
  };

  let openAiResponse: Response;
  try { openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_COGNITIVE_ANALYSIS_MODEL') || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a careful cognitive-activity analyst for caregivers. You are not a clinician and must not diagnose or give medical advice.' },
        { role: 'user', content: JSON.stringify(prompt) }
      ],
      response_format: { type: 'json_schema', json_schema: responseSchema }
    })
  }); } catch {
    await markFailed('ai_request_failed');
    return json({ error: 'ai_request_failed' }, 502);
  }

  if (!openAiResponse.ok) {
    // Do not pass upstream detail to the browser; it can contain provider or
    // configuration information that is not useful to a caregiver.
    await markFailed('ai_request_failed');
    return json({ error: 'ai_request_failed' }, 502);
  }

  let analysis: unknown;
  try {
    const completion = await openAiResponse.json();
    analysis = JSON.parse(completion.choices?.[0]?.message?.content || '');
  } catch {
    await markFailed('ai_response_invalid');
    return json({ error: 'ai_response_invalid' }, 502);
  }
  const { error: saveError } = await admin.from('game_sessions').update({
    analysis_status: 'ready', analysis, analysis_error: null, analysis_generated_at: new Date().toISOString()
  }).eq('id', targetSession.id);
  if (saveError) {
    // Without this the row stays claimed as 'processing', so every retry in
    // the next 10 minutes short-circuits to { status: 'processing' } instead
    // of actually re-running — same release valve as the paths above.
    await markFailed('analysis_save_failed');
    return json({ error: 'analysis_save_failed' }, 500);
  }
  return json({ status: 'ready', analysis });
});
