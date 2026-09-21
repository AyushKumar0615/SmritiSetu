import React, { useCallback, useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { PhoneProfileService } from '../../services/phoneProfileService';
import { formatPhoneDisplay } from '../../services/phoneNumber';
import { useTranslation } from '../../hooks/useTranslation';
import InlineNotice from '../common/InlineNotice';

// The caregiver's own contact number (profiles.phone). Connected elders see it
// on their caregiver list and can call or message from there. Saved in E.164;
// leaving the field blank (or "Remove") clears it.
export default function MyPhoneCard({ session }) {
  const { t } = useTranslation();
  const [savedPhone, setSavedPhone] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!session?.id) return;
    setIsLoading(true);
    setLoadFailed(false);
    const result = await PhoneProfileService.getMyPhone(session.id);
    if (result.ok) {
      setSavedPhone(result.phone);
      setInput(result.phone ? formatPhoneDisplay(result.phone) : '');
    } else {
      setLoadFailed(true);
    }
    setIsLoading(false);
  }, [session?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async (value) => {
    if (isSaving) return;
    setIsSaving(true);
    const result = await PhoneProfileService.saveMyPhone(session.id, value);
    setIsSaving(false);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t(result.error === 'invalid_phone' ? 'invalidPhoneError' : 'phoneSaveError') });
      return;
    }
    setSavedPhone(result.phone);
    setInput(result.phone ? formatPhoneDisplay(result.phone) : '');
    setNotice({ tone: 'success', message: t(result.phone ? 'phoneSavedNotice' : 'phoneRemovedNotice') });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    save(input);
  };

  return (
    <section className="well p-5 sm:p-7">
      <div className="flex items-start gap-3 mb-5">
        <Phone className="w-5 h-5 mt-1 shrink-0 text-ember" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-xl font-medium">{t('myPhoneTitle')}</h3>
          <p className="text-sm mt-1 text-ink-faint">{t('myPhoneDesc')}</p>
        </div>
      </div>

      <InlineNotice tone={notice?.tone} message={notice?.message} onDismiss={() => setNotice(null)} />

      {loadFailed ? (
        <div className="notice-strip is-alert flex items-center justify-between gap-4">
          <p className="text-sm text-alert">{t('phoneLoadError')}</p>
          <button type="button" onClick={load} className="btn btn-line shrink-0">{t('retry')}</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
          <div className="flex-1 min-w-0">
            <label className="field-label" htmlFor="my-phone-input">{t('myPhoneFieldLabel')}</label>
            <input
              id="my-phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              value={isLoading ? '' : input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || isSaving}
              placeholder="98765 43210"
              className="input text-lg"
              dir="ltr"
            />
            <p className="text-xs mt-2 text-ink-faint">{t('myPhoneHint')}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {savedPhone && (
              <button type="button" onClick={() => save('')} disabled={isSaving || isLoading} className="btn btn-danger-quiet">
                {t('removePhoneLabel')}
              </button>
            )}
            <button type="submit" disabled={isSaving || isLoading} className="btn btn-ember">
              {isSaving ? t('savingPhoneLabel') : t('savePhoneLabel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
