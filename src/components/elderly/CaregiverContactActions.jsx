import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone } from 'lucide-react';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import { useTranslation } from '../../hooks/useTranslation';
import { PhoneProfileService } from '../../services/phoneProfileService';
import { ContactActionsService } from '../../services/contactActionsService';
import { normalizePhone, formatPhoneDisplay } from '../../services/phoneNumber';
import ConfirmDialog from '../common/ConfirmDialog';

// The one "Call <name>?" confirmation + call, shared by the caregiver list below
// and the dashboard's Call Caregiver tile. Confirming closes the dialog, then
// places the call (directly on Android). onStart / onResult let the caller show
// progress or a failure; onResult gets { ok, method?, error? }.
// Portalled to <body>: a caller inside an animated (transformed) card would
// otherwise trap the fixed overlay inside it.
export function CaregiverCallDialog({ isOpen, name, phone, onClose, onStart, onResult }) {
  const { t } = useTranslation();

  useBackButton(() => { onClose(); return true; }, { enabled: isOpen, priority: BACK_PRIORITY.OVERLAY });

  const handleConfirm = async () => {
    onClose();
    onStart?.();
    const result = await ContactActionsService.call(phone);
    onResult?.(result);
  };

  return createPortal(
    <ConfirmDialog
      isOpen={isOpen}
      title={t('callConfirmTitle').replace('{name}', name || '')}
      message={t('callConfirmMessage').replace('{number}', formatPhoneDisplay(phone || ''))}
      confirmLabel={t('callConfirmLabel')}
      isDanger={false}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />,
    document.body
  );
}

// Shows a connected caregiver's stored phone number with 📞 Call and 💬 Message.
// Call asks first ("Call Priya?"), then dials straight away on Android (the
// dialer elsewhere); Message opens the SMS app addressed to the number. A
// missing or malformed number shows a plain explanation instead of dead buttons.
export default function CaregiverContactActions({ caregiverId, caregiverName }) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [storedPhone, setStoredPhone] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setStoredPhone(null);
    setError('');
    if (!caregiverId) {
      setIsLoading(false);
      return undefined;
    }
    PhoneProfileService.getPhonesForProfiles([caregiverId]).then((phones) => {
      if (cancelled) return;
      setStoredPhone(phones[caregiverId] || null);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [caregiverId]);

  const name = caregiverName || '';
  const phone = normalizePhone(storedPhone || '');

  const handleMessage = async () => {
    setError('');
    const result = await ContactActionsService.message(phone);
    if (!result.ok) setError(t('messageFailedError'));
  };

  if (isLoading) return <p className="text-xs mt-3 text-ink-faint">{t('phoneLoadingLabel')}</p>;
  if (!storedPhone) return <p className="text-sm mt-3 text-ink-faint">{t('noPhoneNumberLabel').replace('{name}', name)}</p>;
  if (!phone) return <p className="text-sm mt-3 text-alert">{t('invalidPhoneNumberLabel')}</p>;

  return (
    <div className="mt-3">
      <p className="flex items-center gap-2 text-lg font-semibold" dir="ltr">
        <Phone className="w-4 h-4 shrink-0 text-ember" aria-hidden="true" />
        <span>{formatPhoneDisplay(phone)}</span>
      </p>

      <div className="flex flex-wrap gap-2.5 mt-3">
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={isBusy} className="btn btn-ember !min-h-[52px] text-base">
          <span aria-hidden="true">📞</span> {t('callActionLabel')}
        </button>
        <button type="button" onClick={handleMessage} disabled={isBusy} className="btn btn-line !min-h-[52px] text-base">
          <span aria-hidden="true">💬</span> {t('messageActionLabel')}
        </button>
      </div>

      {error && <p role="alert" className="text-sm mt-2.5 text-alert">{error}</p>}

      <CaregiverCallDialog
        isOpen={confirmOpen}
        name={name}
        phone={phone}
        onClose={() => setConfirmOpen(false)}
        onStart={() => { setIsBusy(true); setError(''); }}
        onResult={(result) => { setIsBusy(false); if (!result.ok) setError(t('callFailedError')); }}
      />
    </div>
  );
}
