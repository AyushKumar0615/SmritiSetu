import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import { ArrowLeft, Copy, RefreshCw, ShieldCheck, UserCheck, UserX, Users, Check } from 'lucide-react';
import { CaregiverConnectionService } from '../../services/caregiverConnectionService';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { useTranslation } from '../../hooks/useTranslation';
import UserAvatar from '../common/UserAvatar';
import ConfirmDialog from '../common/ConfirmDialog';
import InlineNotice from '../common/InlineNotice';
import ErrorBoundary from '../common/ErrorBoundary';
import CaregiverContactActions from './CaregiverContactActions';

const ERROR_KEY = {
  unknown: 'connectionGenericError',
  not_elder: 'connectionNotElderError'
};

export default function CaregiverConnectionsView(props) {
  return (
    <ErrorBoundary>
      <CaregiverConnectionsViewInner {...props} />
    </ErrorBoundary>
  );
}

function CaregiverConnectionsViewInner({ session, onBack }) {
  const { t } = useTranslation();
  const containerRef = useScrollReveal();

  const [code, setCode] = useState('');
  const [isLoadingCode, setIsLoadingCode] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [connections, setConnections] = useState([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [notice, setNotice] = useState(null); // { tone, message }

  useBackButton(() => { setDisconnectTarget(null); return true; }, { enabled: !!disconnectTarget, priority: BACK_PRIORITY.OVERLAY });

  const loadCode = useCallback(async () => {
    if (!session?.id) return;
    setIsLoadingCode(true);
    const result = await CaregiverConnectionService.getMyConnectionCode(session.id);
    if (result.ok) setCode(result.code);
    else setNotice({ tone: 'error', message: t(ERROR_KEY[result.error] || 'connectionGenericError') });
    setIsLoadingCode(false);
  }, [session?.id, t]);

  const loadConnections = useCallback(async () => {
    if (!session?.id) {
      setIsLoadingConnections(false);
      return;
    }
    setIsLoadingConnections(true);
    setLoadError('');
    const result = await CaregiverConnectionService.listCaregiversForElder(session.id);
    if (!result.ok) {
      setLoadError(t('connectionsLoadError'));
      setIsLoadingConnections(false);
      return;
    }
    setConnections(result.connections);
    setIsLoadingConnections(false);
  }, [session?.id, t]);

  useEffect(() => { loadCode(); }, [loadCode]);
  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ tone: 'error', message: t('connectionGenericError') });
    }
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    const result = await CaregiverConnectionService.regenerateCode();
    setIsRegenerating(false);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t(ERROR_KEY[result.error] || 'connectionGenericError') });
      return;
    }
    setCode(result.code);
    setNotice({ tone: 'success', message: t('codeRegeneratedNotice') });
  };

  const handleRespond = async (connectionId, status) => {
    if (respondingId) return;
    setRespondingId(connectionId);
    const result = await CaregiverConnectionService.respondToRequest(connectionId, status);
    setRespondingId(null);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t('connectionGenericError') });
      return;
    }
    setConnections((prev) => prev.map((c) => (c.id === connectionId ? result.connection : c)));
    setNotice({ tone: status === 'accepted' ? 'success' : 'info', message: t(status === 'accepted' ? 'requestAcceptedNotice' : 'requestRejectedNotice') });
  };

  const confirmDisconnect = async () => {
    if (isDisconnecting || !disconnectTarget?.id) return;
    const targetId = disconnectTarget.id;
    setIsDisconnecting(true);
    let result;
    try {
      result = await CaregiverConnectionService.disconnect(targetId);
    } catch {
      result = { ok: false };
    }
    setIsDisconnecting(false);
    setDisconnectTarget(null);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t('connectionGenericError') });
      return;
    }
    setConnections((prev) => prev.filter((c) => c.id !== targetId));
    setNotice({ tone: 'info', message: t('connectionRemovedNotice') });
  };

  const pending = connections.filter((c) => c.status === 'pending');
  const accepted = connections.filter((c) => c.status === 'accepted');

  return (
    <div ref={containerRef} className="page max-w-2xl">
      <button type="button" onClick={onBack} className="btn btn-quiet !flex !px-0 mb-8"><ArrowLeft className="w-4 h-4" /> {t('back')}</button>

      <span className="eyebrow">{t('caregiverConnectionsEyebrow')}</span>
      <h2 className="font-display text-3xl md:text-4xl font-medium mt-3 mb-8">{t('navMyCaregivers')}</h2>

      <InlineNotice tone={notice?.tone} message={notice?.message} onDismiss={() => setNotice(null)} />

      {/* Connection code */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="panel-dark p-7 sm:p-9 mb-10">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-1 shrink-0 text-ember" />
          <div className="min-w-0">
            <h3 className="font-display text-xl font-medium">{t('connectionCodeTitle')}</h3>
            <p className="text-sm mt-1 text-ink-faint">{t('connectionCodeDesc')}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4">
          <div
            className="font-mono text-3xl sm:text-4xl font-semibold tracking-[0.3em] px-6 py-4 rounded-[var(--radius-md)] text-center sm:text-left shrink-0"
            style={{ background: 'var(--canvas-recessed)', border: '1px solid var(--hairline)', color: 'var(--ink)', minWidth: '11rem' }}
            aria-live="polite"
          >
            {isLoadingCode ? '······' : code}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={handleCopy} disabled={isLoadingCode || !code} className="btn btn-line text-ink">
              {copied ? <Check className="w-4 h-4 text-jade" /> : <Copy className="w-4 h-4" />} {t('copyCodeLabel')}
            </button>
            <button type="button" onClick={handleRegenerate} disabled={isRegenerating || isLoadingCode} className="btn btn-quiet">
              <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} /> {isRegenerating ? t('regeneratingCodeLabel') : t('regenerateCodeLabel')}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Pending requests */}
      <section className="mb-10">
        <h3 className="font-display text-xl font-medium mb-4">{t('pendingRequestsTitle')}</h3>
        {isLoadingConnections ? (
          <p className="text-sm text-ink-faint">{t('connectionsLoadingLabel')}</p>
        ) : loadError ? (
          <div className="notice-strip is-alert flex items-center justify-between gap-4">
            <p className="text-sm text-alert">{loadError}</p>
            <button type="button" onClick={loadConnections} className="btn btn-line shrink-0">{t('retry')}</button>
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-ink-faint">{t('noPendingRequestsLabel')}</p>
        ) : (
          <div className="space-y-4">
            {pending.map((conn) => (
              <motion.div key={conn.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="well p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-3.5 min-w-0">
                  <UserAvatar avatar={conn.caregiver?.avatar} fullName={conn.caregiver?.fullName} className="w-11 h-11 rounded-full overflow-hidden object-cover shrink-0" iconClassName="w-1/3 h-1/3" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide block text-ember">{t('caregiverRequestLabel')}</span>
                    <span className="font-display text-lg font-medium block truncate">{conn.caregiver?.fullName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button type="button" disabled={respondingId === conn.id} onClick={() => handleRespond(conn.id, 'rejected')} className="btn btn-line btn-danger-outline">
                    <UserX className="w-4 h-4" /> {t('rejectLabel')}
                  </button>
                  <button type="button" disabled={respondingId === conn.id} onClick={() => handleRespond(conn.id, 'accepted')} className="btn btn-ember">
                    <UserCheck className="w-4 h-4" /> {t('acceptLabel')}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Connected caregivers */}
      <section>
        <h3 className="font-display text-xl font-medium mb-4">{t('connectedCaregiversTitle')}</h3>
        {!isLoadingConnections && accepted.length === 0 && !loadError ? (
          <div className="panel-light p-8 sm:p-10 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(79,174,142,0.15)', color: 'var(--jade-deep)' }}>
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-display text-xl font-medium">{t('noCaregiverConnectedTitle')}</h4>
              <p className="text-sm mt-1.5" style={{ color: 'rgba(23,20,15,0.6)' }}>{t('noCaregiverConnectedDesc')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {accepted.map((conn) => (
              <motion.div key={conn.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="well p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-3.5 min-w-0">
                  <UserAvatar avatar={conn.caregiver?.avatar} fullName={conn.caregiver?.fullName} className="w-11 h-11 rounded-full overflow-hidden object-cover shrink-0" iconClassName="w-1/3 h-1/3" />
                  <div className="min-w-0">
                    <span className="font-display text-lg font-medium block truncate">{conn.caregiver?.fullName}</span>
                    <span className="text-xs block mt-0.5 text-jade">
                      {t('connectedSinceLabel')} {new Date(conn.updatedAt).toLocaleDateString()}
                    </span>
                    <CaregiverContactActions caregiverId={conn.caregiver?.id} caregiverName={conn.caregiver?.fullName} />
                  </div>
                </div>
                <button type="button" onClick={() => setDisconnectTarget(conn)} className="btn btn-danger-quiet shrink-0">
                  {t('disconnectLabel')}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={!!disconnectTarget}
        title={t('disconnectCaregiverConfirmTitle')}
        message={t('disconnectCaregiverConfirmMessage')}
        confirmLabel={isDisconnecting ? t('disconnectingLabel') : t('disconnectLabel')}
        confirmDisabled={isDisconnecting}
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}
