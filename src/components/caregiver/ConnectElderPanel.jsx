import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, HeartHandshake, Clock3, Users } from 'lucide-react';
import { CaregiverConnectionService } from '../../services/caregiverConnectionService';
import { useTranslation } from '../../hooks/useTranslation';
import UserAvatar from '../common/UserAvatar';
import ConfirmDialog from '../common/ConfirmDialog';
import InlineNotice from '../common/InlineNotice';
import { SkeletonList } from '../common/Skeleton';
import MyPhoneCard from './MyPhoneCard';

const ERROR_KEY = {
  invalid_code: 'connectionInvalidCodeError',
  self_connection: 'connectionSelfError',
  already_connected: 'connectionAlreadyConnectedError',
  already_pending: 'connectionAlreadyPendingError',
  not_caregiver: 'connectionNotCaregiverError',
  unknown: 'connectionGenericError'
};

export default function ConnectElderPanel({ session, connections, isLoading, loadError, onRetry, onConnected, onDisconnected }) {
  const { t } = useTranslation();
  const [codeInput, setCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const result = await CaregiverConnectionService.requestConnection(codeInput);
    setIsSubmitting(false);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t(ERROR_KEY[result.error] || 'connectionGenericError') });
      return;
    }
    setCodeInput('');
    setNotice({ tone: 'success', message: t('requestSentNotice') });
    onConnected?.();
  };

  const confirmDisconnect = async () => {
    if (!disconnectTarget) return;
    setIsDisconnecting(true);
    const result = await CaregiverConnectionService.disconnect(disconnectTarget.id);
    setIsDisconnecting(false);
    setDisconnectTarget(null);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t('connectionGenericError') });
      return;
    }
    setNotice({ tone: 'info', message: t('connectionRemovedNotice') });
    onDisconnected?.(disconnectTarget.id);
  };

  const accepted = connections.filter((c) => c.status === 'accepted');
  const pending = connections.filter((c) => c.status === 'pending');

  return (
    <div className="space-y-10">
      <InlineNotice tone={notice?.tone} message={notice?.message} onDismiss={() => setNotice(null)} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="panel-dark p-7 sm:p-9">
        <div className="flex items-start gap-3 mb-6">
          <Link2 className="w-5 h-5 mt-1 shrink-0 text-ember" />
          <div>
            <h3 className="font-display text-xl font-medium">{t('connectToElderTitle')}</h3>
            <p className="text-sm mt-1 text-ink-faint">{t('connectToElderDesc')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
          <div className="flex-1">
            <label className="field-label">{t('connectionCodeFieldLabel')}</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="482731"
              className="input font-mono tracking-[0.3em] text-lg"
              required
            />
          </div>
          <button type="submit" disabled={isSubmitting || codeInput.length !== 6} className="btn btn-ember shrink-0">
            {isSubmitting ? t('sendingRequestLabel') : t('sendRequestLabel')}
          </button>
        </form>
      </motion.div>

      <MyPhoneCard session={session} />

      <section>
        <h3 className="font-display text-xl font-medium mb-4">{t('connectedElderTitle')}</h3>
        {isLoading ? (
          <SkeletonList rows={2} label={t('connectionsLoadingLabel')} />
        ) : loadError ? (
          <div className="notice-strip is-alert flex items-center justify-between gap-4">
            <p className="text-sm text-alert">{loadError}</p>
            <button type="button" onClick={onRetry} className="btn btn-line shrink-0">{t('retry')}</button>
          </div>
        ) : accepted.length === 0 && pending.length === 0 ? (
          <div className="panel-light p-8 sm:p-10 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(226,112,58,0.15)', color: 'var(--ember-deep)' }}>
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-display text-xl font-medium">{t('noElderConnectedTitle')}</h4>
              <p className="text-sm mt-1.5" style={{ color: 'rgba(23,20,15,0.6)' }}>{t('noElderConnectedDesc')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((conn) => (
              <div key={conn.id} className="well p-5 flex items-center gap-3.5">
                <UserAvatar avatar={conn.elder?.avatar} fullName={conn.elder?.fullName} className="w-11 h-11 rounded-full overflow-hidden object-cover shrink-0" iconClassName="w-1/3 h-1/3" />
                <div className="min-w-0 flex-1">
                  <span className="font-display text-lg font-medium block truncate">{conn.elder?.fullName}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mt-0.5 text-ember">
                    <Clock3 className="w-3.5 h-3.5" /> {t('pendingApprovalNotice')}
                  </span>
                </div>
              </div>
            ))}
            {accepted.map((conn) => (
              <div key={conn.id} className="well p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-3.5 min-w-0">
                  <UserAvatar avatar={conn.elder?.avatar} fullName={conn.elder?.fullName} className="w-11 h-11 rounded-full overflow-hidden object-cover shrink-0" iconClassName="w-1/3 h-1/3" />
                  <div className="min-w-0">
                    <span className="font-display text-lg font-medium block truncate">{conn.elder?.fullName}</span>
                    <span className="text-xs flex items-center gap-1.5 mt-0.5 text-jade">
                      <HeartHandshake className="w-3.5 h-3.5" /> {t('connectedSinceLabel')} {new Date(conn.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setDisconnectTarget(conn)} className="btn btn-danger-quiet shrink-0">
                  {t('disconnectLabel')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={!!disconnectTarget}
        title={t('disconnectElderConfirmTitle')}
        message={t('disconnectElderConfirmMessage')}
        confirmLabel={isDisconnecting ? t('disconnectingLabel') : t('disconnectLabel')}
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}
