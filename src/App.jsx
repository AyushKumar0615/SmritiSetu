import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { pageTransition } from './components/common/pageTransition';
import Header from './components/common/Header';
import AuthPortal from './components/auth/AuthPortal';
import ElderlyHome from './components/elderly/ElderlyHome';
import CaregiverDashboard from './components/caregiver/CaregiverDashboard';
import AdminPortal from './components/admin/AdminPortal';
import { NER_STATES } from './data/regionalContent';
import { AuthService } from './services/authService';
import { LanguageProvider } from './hooks/useTranslation';
import { useElderLocationTracking } from './hooks/useElderLocationTracking';
import { useReminderAlerts } from './hooks/useReminderAlerts';
import { ReminderSoundService } from './services/reminderSoundService';
import { PushSubscriptionService } from './services/pushSubscriptionService';
import ReminderAlertOverlay from './components/common/ReminderAlertOverlay';
import { useBackButton } from './hooks/useBackButton';
import { BACK_PRIORITY } from './services/backButtonService';
import { getRoleHome } from './access/permissions';
import RequireRole from './access/RequireRole';

export default function App() {
  const [session, setSession] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [currentMode, setCurrentMode] = useState('elderly');
  const [homeResetKey, setHomeResetKey] = useState(0);
  const [currentLang, setCurrentLang] = useState('as');
  const [currentState, setCurrentState] = useState(NER_STATES.ASSAM);

  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState('normal');
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('smritisetu-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    try { localStorage.setItem('smritisetu-theme', theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    let cancelled = false;
    AuthService.getSession().then((restoredSession) => {
      if (cancelled) return;
      if (restoredSession) {
        setSession(restoredSession);
        setCurrentMode(getRoleHome(restoredSession.role));
        setCurrentLang(restoredSession.language || 'as');
        setCurrentState(restoredSession.state || NER_STATES.ASSAM);
      }
      setIsRestoringSession(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Mounted here (not inside ElderlyHome) so the watcher survives in-app
  // navigation and remounts — it only starts/stops on session changes.
  const locationTracking = useElderLocationTracking(session);

  // Same reasoning: mounted at the app root, not inside a page, so a due
  // reminder still triggers no matter which page/game the user is on and
  // survives in-app navigation without resetting.
  const reminderAlerts = useReminderAlerts(session);

  useBackButton(() => { setCurrentMode(getRoleHome(session?.role)); return true; }, {
    enabled: !!session && currentMode !== getRoleHome(session.role),
    priority: BACK_PRIORITY.MODE
  });

  useEffect(() => {
    ReminderSoundService.attachGesturePrimer();
  }, []);

  // The service worker resubscribes on its own if the browser ever rotates
  // a push subscription's endpoint (see the pushsubscriptionchange listener
  // in public/sw.js), but persisting that replacement needs an
  // authenticated Supabase client, which only this open page has — so it
  // hands the new subscription back here via postMessage.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== 'PUSH_SUBSCRIPTION_CHANGED' || !session?.id) return;
      PushSubscriptionService.replace(session.id, event.data.oldEndpoint, {
        toJSON: () => event.data.subscription
      });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [session?.id]);

  useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast-mode');
    } else {
      document.body.classList.remove('high-contrast-mode');
    }
  }, [highContrast]);

  const handleAuthenticated = (nextSession) => {
    setSession(nextSession);
    setCurrentMode(getRoleHome(nextSession.role));
    setCurrentLang(nextSession.language || 'en');
    setCurrentState(nextSession.state || NER_STATES.ASSAM);
  };

  const goHome = () => {
    setCurrentMode(getRoleHome(session?.role));
    setHomeResetKey((k) => k + 1);
  };

  // Passed to RequireRole as onDenied: if `currentMode` is ever not
  // permitted for the current session's role (stale state, a tampered
  // value, anything), snap straight back to that role's own home mode.
  const redirectToRoleHome = useCallback(() => {
    setCurrentMode(getRoleHome(session?.role));
  }, [session?.role]);

  const handleLogout = async () => {
    await AuthService.logout();
    setSession(null);
    setCurrentMode('elderly');
  };

  if (isRestoringSession) {
    return <MotionConfig reducedMotion="user"><div className="app-shell" /></MotionConfig>;
  }

  if (!session) {
    return (
      <MotionConfig reducedMotion="user">
        <LanguageProvider lang="en">
          <AuthPortal onAuthenticated={handleAuthenticated} theme={theme} onToggleTheme={toggleTheme} />
        </LanguageProvider>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <LanguageProvider lang={currentLang}>
    <div className={`app-shell ${fontSize === 'lg' ? 'font-scale-lg' : fontSize === 'xl' ? 'font-scale-xl' : ''}`}>
      {currentMode !== 'admin' && (
        <Header
          currentMode={currentMode}
          setCurrentMode={setCurrentMode}
          onLogoClick={goHome}
          currentLang={currentLang}
          setCurrentLang={setCurrentLang}
          currentState={currentState}
          setCurrentState={setCurrentState}
          highContrast={highContrast}
          setHighContrast={setHighContrast}
          fontSize={fontSize}
          setFontSize={setFontSize}
          theme={theme}
          onToggleTheme={toggleTheme}
          session={session}
          onLogout={handleLogout}
          onSessionUpdate={setSession}
        />
      )}

      <main className={currentMode === 'admin' ? 'flex-1' : 'flex-1 pb-24'}>
        <AnimatePresence mode="wait">
          {currentMode === 'elderly' && (
            <motion.div key={`elderly-home-${homeResetKey}`} {...pageTransition}>
              <RequireRole session={session} mode="elderly" onDenied={redirectToRoleHome}>
                <ElderlyHome currentLang={currentLang} currentState={currentState} session={session} locationTracking={locationTracking} />
              </RequireRole>
            </motion.div>
          )}
          {currentMode === 'caregiver' && (
            <motion.div key="caregiver" {...pageTransition}>
              <RequireRole session={session} mode="caregiver" onDenied={redirectToRoleHome}>
                <CaregiverDashboard session={session} />
              </RequireRole>
            </motion.div>
          )}
          {currentMode === 'admin' && (
            <motion.div key="admin" {...pageTransition}>
              <RequireRole session={session} mode="admin" onDenied={redirectToRoleHome}>
                <AdminPortal session={session} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
              </RequireRole>
            </motion.div>
          )}
          {currentMode === 'demo' && (
            <motion.div key="demo" className="space-y-4" {...pageTransition}>
              <ElderlyHome currentLang={currentLang} currentState={currentState} session={session} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ReminderAlertOverlay
        alert={reminderAlerts.activeAlert}
        onComplete={reminderAlerts.completeActive}
        onSnooze={reminderAlerts.snoozeActive}
      />
    </div>
    </LanguageProvider>
    </MotionConfig>
  );
}
