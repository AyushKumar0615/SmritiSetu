import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import { Feather, LockKeyhole, UserPlus, ArrowRight } from 'lucide-react';
import { INDIAN_STATES_AND_UTS, INDIAN_LANGUAGES } from '../../data/regionalContent';
import { AuthService, GOOGLE_OAUTH_NATIVE_REDIRECT } from '../../services/authService';
import Magnetic from '../common/Magnetic';
import AvatarPicker from '../common/AvatarPicker';
import ThemeToggle from '../common/ThemeToggle';
import { useTranslation } from '../../hooks/useTranslation';

const initialLogin = { email: '', password: '' };
const initialRegister = { fullName: '', email: '', password: '', role: 'caregiver', state: 'Assam', language: 'en', avatar: null };

// Google's official four-colour "G" mark, kept in its brand colours
// regardless of app theme (as their button guidelines ask) — inlined here
// since it's used in exactly one place, rather than as a separate asset file.
function GoogleGlyph(props) {
  return (
    <svg viewBox="0 0 18 18" {...props}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

export default function AuthPortal({ onAuthenticated, theme, onToggleTheme }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('login');
  useBackButton(() => { setActiveTab('login'); return true; }, { enabled: activeTab === 'register', priority: BACK_PRIORITY.SUBVIEW });
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const isCompletingGoogleRedirect = useRef(false);

  // Android only: picks up the deep-link return from AuthService.loginWithGoogle()
  // (see its comment for the full round trip). Scoped to this component's
  // lifetime, which matches exactly when this can happen — the deep link only
  // ever arrives while the user is mid-sign-in, i.e. while this screen is up.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let urlHandle;
    let stateHandle;

    CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(GOOGLE_OAUTH_NATIVE_REDIRECT)) return; // not our sign-in redirect
      isCompletingGoogleRedirect.current = true;
      setIsGoogleSubmitting(true);
      const result = await AuthService.completeOAuthRedirect(url);
      isCompletingGoogleRedirect.current = false;
      setIsGoogleSubmitting(false);
      if (!result.ok) { setError(result.error); return; }
      setError('');
      onAuthenticated(result.session);
    }).then((handle) => { urlHandle = handle; });

    // The user can back out of the browser (e.g. the system back button)
    // without finishing sign-in — when the app regains focus and no deep
    // link ever arrived, don't leave the button stuck spinning forever.
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && !isCompletingGoogleRedirect.current) setIsGoogleSubmitting(false);
    }).then((handle) => { stateHandle = handle; });

    return () => { urlHandle?.remove(); stateHandle?.remove(); };
  }, [onAuthenticated]);

  const submitLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const result = await AuthService.login(loginForm);
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setError('');
    onAuthenticated(result.session);
  };

  // Unlike submitLogin/submitRegister, success here doesn't call
  // onAuthenticated directly — the browser is about to navigate to Google,
  // so the button is simply left in its loading state. The user who lands
  // back in the app afterward is picked up by App.jsx's existing session
  // restoration, the same path a page refresh already uses.
  const handleGoogleSignIn = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    setIsGoogleSubmitting(true);
    setError('');
    const result = await AuthService.loginWithGoogle();
    if (!result.ok) {
      setIsGoogleSubmitting(false);
      setError(result.error);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const result = await AuthService.register(registerForm);
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setError('');
    onAuthenticated(result.session);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-between">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60rem 46rem at 12% 8%, rgba(226,112,58,0.16), transparent 60%), radial-gradient(50rem 46rem at 92% 92%, rgba(79,174,142,0.14), transparent 60%), var(--canvas)'
        }}
      />

      <header className="relative rail-pad pt-8 md:pt-10 flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-2.5">
          <span className="mark-glyph"><Feather className="w-4 h-4" /></span>
          <span className="eyebrow">SmritiSetu — Keeping Memories Close</span>
        </span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="relative rail-pad flex-1 flex items-center py-12 md:py-0">
        <div className="content-col w-full grid lg:grid-cols-[1.3fr_0.9fr] gap-14 lg:gap-10 items-center">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-medium leading-[0.98] text-[clamp(2.8rem,7.5vw,6.4rem)]"
          >
            A gentle
            <br />
            bridge back to
            <br />
            <em className="italic text-ember">memory.</em>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="glass rounded-[var(--radius-lg)] p-7 md:p-8 w-full max-w-md lg:ml-auto"
          >
            <div className="flex gap-6 mb-6 border-b border-hairline">
              {['login', 'register'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setActiveTab(tab); setError(''); }}
                  className={`tab-link capitalize ${activeTab === tab ? 'is-active' : ''}`}
                >
                  {tab === 'login' ? t('signIn') : t('register')}
                  {activeTab === tab && (
                    <motion.span layoutId="auth-tab-underline" className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ background: 'var(--ember)' }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} />
                  )}
                </button>
              ))}
            </div>

            {error ? (
              <div className="notice-strip is-alert mb-5 text-sm text-alert" role="alert">{error}</div>
            ) : null}

            <AnimatePresence mode="wait">
              {activeTab === 'login' ? (
                <motion.form
                  key="login"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={submitLogin}
                  className="space-y-5"
                >
                  <div>
                    <label className="field-label">{t('emailLabel')}</label>
                    <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className="input" placeholder="name@example.com" required />
                  </div>
                  <div>
                    <label className="field-label">{t('passwordLabel')}</label>
                    <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className="input" placeholder="••••••••" required />
                  </div>
                  <Magnetic strength={0.15} className="block">
                    <button type="submit" disabled={isSubmitting} className={`btn btn-ember w-full mt-2 ${isSubmitting ? 'is-loading' : ''}`}>
                      <LockKeyhole className="w-4 h-4" /> {t('enterWorkspace')}
                    </button>
                  </Magnetic>

                  <div className="flex items-center gap-3 my-1" aria-hidden="true">
                    <span className="flex-1 h-px" style={{ background: 'var(--hairline-strong)' }} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('orDividerLabel')}</span>
                    <span className="flex-1 h-px" style={{ background: 'var(--hairline-strong)' }} />
                  </div>

                  <Magnetic strength={0.15} className="block">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isGoogleSubmitting || isSubmitting}
                      className={`btn btn-line w-full ${isGoogleSubmitting ? 'is-loading' : ''}`}
                    >
                      <GoogleGlyph className="w-4 h-4" aria-hidden="true" /> {t('continueWithGoogleLabel')}
                    </button>
                  </Magnetic>
                </motion.form>
              ) : (
                <motion.form
                  key="register"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={submitRegister}
                  className="space-y-5"
                >
                  <div>
                    <label className="field-label">{t('fullNameLabel')}</label>
                    <input type="text" value={registerForm.fullName} onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })} className="input" placeholder="Kamala Devi" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">{t('emailLabel')}</label>
                      <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} className="input" placeholder="you@mail.com" required />
                    </div>
                    <div>
                      <label className="field-label">{t('passwordLabel')}</label>
                      <input type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} className="input" placeholder="Min. 6 chars" required minLength={6} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="field-label">{t('roleLabel')}</label>
                      <select value={registerForm.role} onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })} className="select">
                        <option value="elderly">{t('modeElderlyLabel')}</option>
                        <option value="caregiver">{t('modeCaregiverLabel')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">{t('stateLabel')}</label>
                      <select value={registerForm.state} onChange={(e) => setRegisterForm({ ...registerForm, state: e.target.value })} className="select">
                        {INDIAN_STATES_AND_UTS.map((state) => (<option key={state} value={state}>{state}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">{t('languageLabel')}</label>
                      <select value={registerForm.language} onChange={(e) => setRegisterForm({ ...registerForm, language: e.target.value })} className="select">
                        {INDIAN_LANGUAGES.map((lang) => (<option key={lang.code} value={lang.code}>{lang.name}</option>))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">{t('profilePictureLabel')}</label>
                    <AvatarPicker
                      value={registerForm.avatar}
                      fullName={registerForm.fullName}
                      onChange={(avatar) => setRegisterForm({ ...registerForm, avatar })}
                    />
                  </div>
                  <Magnetic strength={0.15} className="block">
                    <button type="submit" disabled={isSubmitting} className={`btn btn-ember w-full mt-2 ${isSubmitting ? 'is-loading' : ''}`}>
                      <UserPlus className="w-4 h-4" /> {t('createAccount')}
                    </button>
                  </Magnetic>
                </motion.form>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => { setActiveTab(activeTab === 'login' ? 'register' : 'login'); setError(''); }}
              className="mt-6 text-sm font-medium inline-flex items-center gap-1 text-ink-faint"
            >
              {activeTab === 'login' ? t('needAccountRegister') : t('alreadyRegisteredSignIn')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        </div>
      </main>

      <footer className="relative rail-pad pb-8 md:pb-10">
        <p className="pin max-w-lg">
          Your memories. Your story. Your SmritiSetu.
        </p>
      </footer>
    </div>
  );
}
