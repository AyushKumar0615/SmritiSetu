import { supabase } from './supabaseClient';

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSession(row) {
  return {
    id: row.id, gameId: row.game_id, domain: row.domain, score: number(row.score),
    accuracy: number(row.accuracy), bestStreak: number(row.best_streak),
    difficultyLevel: number(row.difficulty_level), completionTimeSeconds: number(row.completion_time_seconds), completedAt: row.completed_at,
    analysisStatus: row.analysis_status || 'pending', analysis: row.analysis || null,
    analysisError: row.analysis_error || null
  };
}

// Every error code requestAnalysis() can return, mapped to a message a
// caregiver can actually act on via the retry UI — instead of one generic
// "unavailable" string for every cause. Keys match the analyze-cognitive-
// sessions Edge Function's own { error: <code> } bodies (see its source)
// plus the client-only codes requestAnalysis() adds itself.
const ANALYSIS_ERROR_MESSAGES = {
  network_error: 'Could not reach the analysis service — check your connection and try again.',
  unauthorized: 'Your sign-in has expired. Please sign in again, then retry.',
  session_not_found: 'This game result could not be found. It may have been removed.',
  session_owner_mismatch: "You don't have permission to analyse this session.",
  caregiver_not_connected: "You aren't currently connected to this elder, so their session can't be analysed.",
  caller_profile_forbidden: 'Your account is not authorized to request cognitive analysis.',
  connection_lookup_failed: 'Could not verify your connection to this elder. Please try again.',
  sessions_query_failed: "Could not read this elder's game history. Please try again.",
  ai_not_configured: 'AI analysis is not configured on the server. An administrator must set the OPENAI_API_KEY Edge Function secret.',
  ai_request_failed: 'The AI analysis provider did not respond. Please try again shortly.',
  ai_response_invalid: 'The AI analysis came back in an unexpected format. Please try again.',
  analysis_save_failed: 'The analysis was generated but could not be saved. Please try again.',
  analysis_claim_failed: 'Could not start the analysis. Please try again.'
};

function describeAnalysisError(code) {
  return ANALYSIS_ERROR_MESSAGES[code] || 'Analysis is still unavailable. The game result remains saved; please try again later.';
}

export const CognitiveAnalyticsService = {
  describeAnalysisError,

  async recordSession(payload) {
    // The database RLS policy and the analysis function both authorize with
    // the Supabase Auth JWT. Resolve that same source of truth here rather
    // than accepting a separately cached React profile ID.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (authError || !userId) return { ok: false, error: 'Missing signed-in user.' };
    const row = {
      user_id: userId,
      game_id: String(payload.gameId || ''),
      domain: String(payload.domain || ''),
      score: Math.max(0, Math.round(number(payload.score))),
      accuracy: Math.max(0, Math.min(100, Math.round(number(payload.accuracy) * 100) / 100)),
      best_streak: Math.max(0, Math.round(number(payload.bestStreak))),
      difficulty_level: Math.max(1, Math.min(5, Math.round(number(payload.difficultyLevel)))),
      completion_time_seconds: Math.max(0, Math.round(number(payload.completionTimeSeconds)))
    };
    if (!row.game_id || !row.domain) return { ok: false, error: 'Incomplete game result.' };
    const { data, error } = await supabase.from('game_sessions').insert(row).select('id, game_id, domain, score, accuracy, best_streak, difficulty_level, completion_time_seconds, completed_at, analysis_status, analysis').single();
    return error ? { ok: false, error: error.message } : { ok: true, session: toSession(data) };
  },

  async requestAnalysis(sessionId) {
    if (!sessionId) return { ok: false, error: 'No completed game session.' };
    // Pass the current user JWT explicitly. This avoids relying on a cached
    // SDK auth header and guarantees that the function authorizes the same
    // user who owns (or is connected to) the selected session.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return { ok: false, error: 'unauthorized' };
    const { data, error } = await supabase.functions.invoke('analyze-cognitive-sessions', {
      body: { sessionId },
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (error) {
      // error.context is only a Response when the function actually ran and
      // returned a non-2xx (FunctionsHttpError) — that response carries the
      // function's own { error: <code> } body. When the request never
      // reached the function at all (FunctionsFetchError: DNS/CORS/offline/
      // timeout), context is the raw fetch failure instead, which has no
      // .json(); surface that distinctly rather than collapsing it into the
      // same generic code the function itself would return.
      let code = 'network_error';
      if (error?.context && typeof error.context.json === 'function') {
        try { code = (await error.context.json())?.error || 'analysis_request_failed'; }
        catch { code = 'analysis_request_failed'; }
      }
      return { ok: false, error: code };
    }
    if (data?.status === 'processing') return { ok: true, status: 'processing' };
    if (data?.status !== 'ready' || !data.analysis) return { ok: false, error: data?.error || 'analysis_request_failed' };
    return { ok: true, status: 'ready', analysis: data.analysis };
  },

  async listSessions(elderId) {
    if (!elderId) return { ok: false, error: 'No elder selected.' };
    const { data, error } = await supabase
      .from('game_sessions')
      .select('id, game_id, domain, score, accuracy, best_streak, difficulty_level, completion_time_seconds, completed_at, analysis_status, analysis, analysis_error')
      .eq('user_id', elderId)
      .order('completed_at', { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: error.message };
    return { ok: true, sessions: (data || []).map(toSession) };
  }
};
