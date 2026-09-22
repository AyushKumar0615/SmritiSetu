import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import {
  Feather,
  HeartPulse,
  LayoutDashboard,
  Shield,
  Sparkles,
  Contrast,
  TextCursorInput,
  LogOut,
  X,
  ArrowUpRight
} from 'lucide-react';
import { INDIAN_STATES_AND_UTS, INDIAN_LANGUAGES } from '../../data/regionalContent';
import Magnetic from './Magnetic';
import UserAvatar from './UserAvatar';
import AvatarPicker from './AvatarPicker';
import ThemeToggle from './ThemeToggle';
import { AuthService } from '../../services/authService';
import { useTranslation } from '../../hooks/useTranslation';
import { getAllowedModes } from '../../access/permissions';

const MODES = [
  { id: 'elderly', labelKey: 'modeElderlyLabel', icon: HeartPulse, descKey: 'modeElderlyDesc' },
  { id: 'caregiver', labelKey: 'modeCaregiverLabel', icon: LayoutDashboard, descKey: 'modeCaregiverDesc' },
  { id: 'admin', labelKey: 'modeAdminLabel', icon: Shield, descKey: 'modeAdminDesc' },
  { id: 'demo', labelKey: 'modeDemoLabel', icon: Sparkles, descKey: 'modeDemoDesc' }
];

export default function Header({
  currentMode,
  setCurrentMode,
  onLogoClick,
  currentLang,
  setCurrentLang,
  currentState,
  setCurrentState,
  highContrast,
  setHighContrast,
  fontSize,
  setFontSize,
  theme,
  onToggleTheme,
  session,
  onLogout,
  onSessionUpdate
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  useBackButton(() => {
    if (avatarEditorOpen) setAvatarEditorOpen(false);
    else setIsOpen(false);
    return true;
  }, { enabled: isOpen, priority: BACK_PRIORITY.OVERLAY });
  // Centralized role -> allowed-modes config (src/access/permissions.js) is
  // the only place that decides who sees what — never duplicate that check
  // here, just filter the nav against it.
  const allowedModeIds = getAllowedModes(session?.role);
  const visibleModes = MODES.filter((mode) => allowedModeIds.includes(mode.id));
  const activeMode = visibleModes.find((m) => m.id === currentMode) || visibleModes[0];
  const ActiveIcon = activeMode.icon;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSelectMode = (id) => {
    setCurrentMode(id);
    setIsOpen(false);
  };

  return (
    <>
      <div className="float-bar">
        <Magnetic strength={0.25}>
          <button type="button" className="mark-btn" onClick={onLogoClick}>
            <span className="mark-glyph"><Feather className="w-4 h-4" /></span>
            <span className="hidden sm:flex items-center h-10 px-4 rounded-full leading-none" style={{ background: 'rgba(19, 17, 16, 0.35)', border: '1px solid var(--hairline-strong)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <span className="font-display font-semibold text-base">Smriti<em className="italic text-ember">Setu</em></span>
            </span>
          </button>
        </Magnetic>

        <div className="flex items-center gap-2.5">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Magnetic strength={0.3}>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className={`trigger-btn ${isOpen ? '' : 'trigger-btn-hint'}`}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-label={`${t('workspaceMenuAriaPrefix')} ${t(activeMode.labelKey)}`}
            >
              <ActiveIcon className="w-4.5 h-4.5" />
            </button>
          </Magnetic>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="overlay-scrim"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="rail-pad content-col py-8 md:py-14"
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between mb-10 md:mb-16">
                <span className="eyebrow">{t('workspace')}</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="trigger-btn"
                  aria-label={t('closeMenuAria')}
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
              >
                {visibleModes.map((mode) => {
                  const Icon = mode.icon;
                  const isActive = currentMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleSelectMode(mode.id)}
                      className={`workspace-row ${isActive ? 'is-active' : ''}`}
                    >
                      <span className="flex items-center gap-4 md:gap-6 min-w-0">
                        <Icon className="w-5 h-5 md:w-6 md:h-6 shrink-0" />
                        <span className="min-w-0">
                          <span className="font-display font-semibold text-2xl md:text-4xl block leading-tight">{t(mode.labelKey)}</span>
                          <span className="text-xs md:text-sm block mt-0.5 text-ink-faint">{t(mode.descKey)}</span>
                        </span>
                      </span>
                      <ArrowUpRight className="w-5 h-5 shrink-0" />
                    </button>
                  );
                })}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="mt-10 md:mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
              >
                <div>
                  <label className="field-label">{t('languageLabel')}</label>
                  <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)} className="select">
                    {INDIAN_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">{t('regionLabel')}</label>
                  <select value={currentState} onChange={(e) => setCurrentState(e.target.value)} className="select">
                    {INDIAN_STATES_AND_UTS.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">{t('contrastLabel')}</label>
                  <button
                    type="button"
                    onClick={() => setHighContrast(!highContrast)}
                    className="flex items-center gap-2 text-sm font-semibold pt-2"
                    style={{ color: highContrast ? 'var(--ember)' : 'var(--ink)' }}
                    aria-pressed={highContrast}
                  >
                    <Contrast className="w-4 h-4" /> {highContrast ? t('contrastOn') : t('contrastOff')}
                  </button>
                </div>
                <div>
                  <label className="field-label">{t('textSizeLabel')}</label>
                  <button
                    type="button"
                    onClick={() => setFontSize(fontSize === 'normal' ? 'lg' : fontSize === 'lg' ? 'xl' : 'normal')}
                    className="flex items-center gap-2 text-sm font-semibold pt-2"
                  >
                    <TextCursorInput className="w-4 h-4" /> {fontSize === 'normal' ? t('textSizeNormal') : fontSize === 'lg' ? t('textSizeLarge') : t('textSizeExtraLarge')}
                  </button>
                </div>
              </motion.div>

              {session && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="mt-10 md:mt-14 pt-6 hairline-top border-t border-hairline"
                >
                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setAvatarEditorOpen((v) => !v)}
                      className="flex items-center gap-3 min-w-0 text-left"
                      aria-expanded={avatarEditorOpen}
                      aria-label={t('changeProfilePictureAria')}
                    >
                      <UserAvatar
                        avatar={session.avatar}
                        fullName={session.fullName}
                        className="w-9 h-9 rounded-full overflow-hidden shrink-0 object-cover"
                        iconClassName="w-4 h-4"
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-semibold block truncate">{session.fullName}</span>
                        <span className="text-xs block truncate capitalize text-ink-faint">{t((MODES.find((m) => m.id === session.role) || MODES[0]).labelKey)} · {t('changePhoto')}</span>
                      </span>
                    </button>
                    <button type="button" onClick={onLogout} className="btn btn-quiet shrink-0">
                      <LogOut className="w-4 h-4" /> {t('logout')}
                    </button>
                  </div>

                  <AnimatePresence>
                    {avatarEditorOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pt-6">
                          <AvatarPicker
                            value={session.avatar}
                            fullName={session.fullName}
                            onChange={async (avatar) => {
                              const nextSession = await AuthService.updateAvatar(session.id, avatar);
                              onSessionUpdate?.(nextSession);
                              setAvatarEditorOpen(false);
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
