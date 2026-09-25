import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, RefreshCw, TrendingUp } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { useTranslation } from '../../hooks/useTranslation';
import { CognitiveAnalyticsService } from '../../services/cognitiveAnalyticsService';
import { SkeletonCards } from '../common/Skeleton';

export default function CognitiveAnalytics({ elderId, userName }) {
  const { t } = useTranslation();
  const containerRef = useScrollReveal();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);

  const loadAnalytics = useCallback(async () => {
    if (!elderId) { setSessions([]); setIsLoading(false); return; }
    setIsLoading(true);
    setError('');
    const result = await CognitiveAnalyticsService.listSessions(elderId);
    if (!result.ok) setError('Unable to load cognitive analysis. Please try again.');
    else setSessions(result.sessions);
    setIsLoading(false);
  }, [elderId]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const latestSession = sessions[0] || null;
  const latestAnalysisSession = sessions.find((session) => session.analysisStatus === 'ready' && session.analysis) || null;
  const retryAnalysis = async () => {
    if (!latestSession) return;
    setIsRetrying(true);
    setError('');
    const result = await CognitiveAnalyticsService.requestAnalysis(latestSession.id);
    // loadAnalytics() clears `error` as it starts, so the reason this retry
    // failed is re-applied after the reload — otherwise client-only codes
    // (network_error, unauthorized) would vanish, since those never reach
    // the row's persisted analysis_error.
    const failureMessage = result.ok ? '' : CognitiveAnalyticsService.describeAnalysisError(result.error);
    await loadAnalytics();
    if (failureMessage) setError(failureMessage);
    setIsRetrying(false);
  };

  let body;
  if (isLoading) body = <SkeletonCards count={3} height="8.5rem" label="Loading cognitive analytics" />;
  else if (error && !sessions.length) body = <FailureState message={error} onRetry={loadAnalytics} label={t('retry')} />;
  else if (!sessions.length) body = <EmptyState t={t} />;
  else if (!latestAnalysisSession) body = <AnalysisUnavailable latestSession={latestSession} error={error} isRetrying={isRetrying} onRetry={retryAnalysis} label={t('retry')} />;
  else body = <AnalysisResults analysis={latestAnalysisSession.analysis} sessions={sessions} />;

  return <div ref={containerRef} className="space-y-12">
    <div className="flex items-start gap-4 scroll-reveal"><div className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Activity className="w-5 h-5" /></div><div><span className="eyebrow">Cognitive activity</span><h3 className="font-display text-xl md:text-2xl font-medium mt-2">{userName}'s game activity</h3><p className="text-sm leading-relaxed mt-2 max-w-2xl text-ink-soft">These game-based trends support caregiver conversations and are not a clinical assessment.</p></div></div>
    {body}
  </div>;
}

function EmptyState({ t }) {
  return <div className="panel-light p-8 sm:p-10 text-center space-y-5 max-w-lg mx-auto"><div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(79,174,142,0.15)', color: 'var(--jade-deep)' }}><Activity className="w-6 h-6" /></div><div><h3 className="font-display text-xl sm:text-2xl font-medium">{t('cognitiveAnalyticsEmptyTitle')}</h3><p className="text-sm mt-2 text-ink-soft">{t('cognitiveAnalyticsEmptyDesc')}</p></div></div>;
}

function FailureState({ message, onRetry, label }) {
  return <div className="panel-light p-8 sm:p-10 text-center space-y-5 max-w-lg mx-auto"><div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(205,78,78,0.12)', color: 'var(--alert)' }}><AlertTriangle className="w-6 h-6" /></div><div><h3 className="font-display text-xl sm:text-2xl font-medium">Analytics unavailable</h3><p className="text-sm mt-2 text-ink-soft">{message}</p></div><button type="button" className="btn btn-on-light" onClick={onRetry}><RefreshCw className="w-4 h-4" /> {label}</button></div>;
}

function AnalysisUnavailable({ latestSession, error, isRetrying, onRetry, label }) {
  const isProcessing = latestSession.analysisStatus === 'processing' || latestSession.analysisStatus === 'pending';
  // A persisted analysis_error (from a prior failed attempt) is shown even
  // before the caregiver clicks Retry, so the reason is visible on first
  // load rather than only after re-triggering the request.
  const persistedReason = latestSession.analysisStatus === 'failed' && latestSession.analysisError
    ? CognitiveAnalyticsService.describeAnalysisError(latestSession.analysisError)
    : null;
  const message = error || persistedReason || (isProcessing ? 'This completed game is still being analysed. Refresh shortly, or retry if it remains pending.' : 'The completed game result is saved, but its analysis could not be generated.');
  return <div className="panel-light p-8 sm:p-10 text-center space-y-5 max-w-lg mx-auto"><div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(226,112,58,0.15)', color: 'var(--ember-deep)' }}><AlertTriangle className="w-6 h-6" /></div><div><h3 className="font-display text-xl sm:text-2xl font-medium">Analysis unavailable</h3><p className="text-sm mt-2 text-ink-soft">{message}</p></div><button type="button" className="btn btn-on-light" onClick={onRetry} disabled={isRetrying}>{isRetrying ? 'Retrying…' : <><RefreshCw className="w-4 h-4" /> {label}</>}</button></div>;
}

function AnalysisResults({ analysis, sessions }) {
  return <div className="space-y-8"><div className="panel-light p-6 sm:p-8"><div className="flex items-start gap-3"><span className="index-icon"><BarChart3 className="w-4.5 h-4.5" /></span><div><h3 className="font-display text-xl font-medium">Caregiver summary</h3><p className="text-sm leading-relaxed mt-3 text-ink-soft">{analysis.summary}</p></div></div></div><AnalyticsList title="Observed patterns">{analysis.observations.map((observation, index) => <div key={`${observation.title}-${index}`} className="index-row !cursor-default"><span className="index-icon"><Activity className="w-4.5 h-4.5" /></span><span className="flex-1 min-w-0"><span className="font-display font-medium block">{observation.title}</span><span className="text-sm leading-relaxed text-ink-soft block mt-1">{observation.detail}</span><span className="text-xs leading-relaxed text-ink-faint block mt-2">Evidence: {observation.evidence}</span></span></div>)}</AnalyticsList><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><MetricCard label="Suggested caregiver action" value={analysis.recommended_action} icon={TrendingUp} /><MetricCard label="Data context" value={analysis.data_sufficiency} icon={Activity} /></div><div className="notice-strip is-ember flex items-center gap-3"><AlertTriangle className="w-4.5 h-4.5 shrink-0 text-ember" /><p className="text-sm text-ink-soft">{analysis.safety_note}</p></div><AnalyticsList title="Recent completed sessions">{sessions.slice(0, 5).map((session) => <div key={session.id} className="index-row !cursor-default"><span className="index-icon"><BarChart3 className="w-4.5 h-4.5" /></span><span className="flex-1 min-w-0"><span className="flex justify-between gap-3"><span className="font-display font-medium">{session.domain} · {session.accuracy}% accuracy</span><span className="text-[11px] font-mono shrink-0 text-ink-faint">{new Date(session.completedAt).toLocaleDateString()}</span></span><span className="text-sm text-ink-soft">Score {session.score} · Level {session.difficultyLevel} · Streak {session.bestStreak} · {session.completionTimeSeconds}s</span></span></div>)}</AnalyticsList></div>;
}

function AnalyticsList({ title, children }) { return <div className="panel-light p-6 sm:p-8"><h3 className="font-display text-xl font-medium">{title}</h3><div className="index-list mt-5">{children}</div></div>; }
function MetricCard({ label, value, icon: Icon }) { return <div className="panel-light p-5"><Icon className="w-5 h-5 text-jade mb-4" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</p><p className="text-base leading-relaxed mt-2 font-medium text-ink">{value}</p></div>; }
