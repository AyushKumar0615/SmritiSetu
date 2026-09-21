import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import { pageTransition } from '../common/pageTransition';
import UserAvatar, { isPhotoAvatar } from '../common/UserAvatar';
import { LocalizationService } from '../../services/localizationService';
import { useTranslation } from '../../hooks/useTranslation';
import { AudioService } from '../../services/audioService';
import { ReminderService, formatTime12h } from '../../services/reminderService';
import { REMINDER_COMPLETED_EVENT } from '../../services/reminderAlertEngine';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import GameShell from './GameShell';
import MemoryJournalView from './MemoryJournalView';
import RemindersView from './RemindersView';
import CaregiverConnectionsView from './CaregiverConnectionsView';
import { CaregiverCallDialog } from './CaregiverContactActions';
import { PhoneProfileService } from '../../services/phoneProfileService';
import InlineNotice from '../common/InlineNotice';
import VoiceAssistantModal from './VoiceAssistantModal';
import VoiceOrb from './VoiceOrb';
import Magnetic from '../common/Magnetic';
import { Volume2, ArrowUpRight, PhoneCall, Home, Brain, BookOpen, Bell, Users, MapPin, ShieldAlert } from 'lucide-react';

const RING_CIRCUMFERENCE = 2 * Math.PI * 20;
const CALL_LOOKUP_MESSAGE_KEY = { no_caregiver: 'callNoCaregiverMessage', no_phone: 'callNoPhoneMessage', error: 'callLookupError' };

export default function ElderlyHome({ currentLang, currentState, session, locationTracking }) {
  const { t } = useTranslation();
  const userName = session?.fullName || t('guestLabel');
  const [activeSubView, setActiveSubView] = useState('home');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(true);
  const containerRef = useScrollReveal();

  // "Call Caregiver" tile: find the primary caregiver's number, then hand over to
  // the same confirm-and-call dialog the caregiver list uses.
  const [callTarget, setCallTarget] = useState(null); // { name, phone }
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isFindingCaregiver, setIsFindingCaregiver] = useState(false);
  const [callNotice, setCallNotice] = useState(null); // { tone, message }

  const handleCallCaregiver = async () => {
    if (isFindingCaregiver) return;
    setCallNotice(null);
    setIsFindingCaregiver(true);
    const result = await PhoneProfileService.getPrimaryCaregiverContact(session?.id);
    setIsFindingCaregiver(false);
    if (result.status === 'found') {
      setCallTarget({ name: result.caregiver.name, phone: result.caregiver.phone });
      setIsCallOpen(true);
      return;
    }
    setCallNotice({ tone: result.status === 'error' ? 'error' : 'info', message: t(CALL_LOOKUP_MESSAGE_KEY[result.status] || 'callLookupError') });
  };

  useBackButton(() => { setIsAssistantOpen(false); return true; }, { enabled: isAssistantOpen, priority: BACK_PRIORITY.OVERLAY });
  useBackButton(() => { setActiveSubView('home'); return true; }, { enabled: activeSubView !== 'home', priority: BACK_PRIORITY.SUBVIEW });

  const spotlightRef = useRef(null);
  const heroRef = useRef(null);

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const portraitY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const portraitOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.4]);
  const nextTaskOpacity = useTransform(scrollYProgress, [0.55, 1], [1, 0.82]);
  const nextTaskY = useTransform(scrollYProgress, [0.55, 1], [0, 10]);

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const tiltXSpring = useSpring(tiltX, { stiffness: 60, damping: 16, mass: 0.6 });
  const tiltYSpring = useSpring(tiltY, { stiffness: 60, damping: 16, mass: 0.6 });

  const culturalProfile = LocalizationService.getCulturalProfile(currentState);

  const loadReminders = useCallback(() => {
    if (!session?.id) {
      setIsLoadingReminders(false);
      return () => {};
    }
    let cancelled = false;
    setIsLoadingReminders(true);
    ReminderService.listReminders(session.id).then((result) => {
      if (cancelled) return;
      setReminders(result.ok ? result.reminders : []);
      setIsLoadingReminders(false);
    });
    return () => { cancelled = true; };
  }, [session?.id]);

  useEffect(() => {
    if (activeSubView !== 'home') return undefined;
    return loadReminders();
  }, [activeSubView, loadReminders]);

  // The reminder alert (mounted app-wide) marks a reminder complete straight
  // through ReminderService — this re-fetches so the home screen's "next
  // task" reflects a completion acknowledged from the popup.
  useEffect(() => {
    const onCompleted = (event) => {
      if (event.detail?.ownerId === session?.id) loadReminders();
    };
    window.addEventListener(REMINDER_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(REMINDER_COMPLETED_EVENT, onCompleted);
  }, [session?.id, loadReminders]);

  const completedCount = reminders.filter((r) => r.isCompleted).length;
  const todayFraction = reminders.length > 0 ? completedCount / reminders.length : 0;
  const nextTask = reminders.find((r) => !r.isCompleted) || null;

  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour < 12) return LocalizationService.getText('goodMorning', currentLang);
    if (hour < 17) return LocalizationService.getText('goodAfternoon', currentLang);
    return LocalizationService.getText('goodEvening', currentLang);
  };

  const handleSpeakGreeting = () => {
    const greetingMsg = `${getGreetingTime()} ${userName}! ${culturalProfile.greeting}. Tap any activity below to play games or view family memories.`;
    setIsSpeaking(true);
    // "onend" is unreliable across browsers/tabs — a duration-based fallback
    // guarantees the orb never gets stuck in the speaking state.
    const estimatedMs = Math.min(20000, Math.max(3000, greetingMsg.split(' ').length * 380));
    const fallback = window.setTimeout(() => setIsSpeaking(false), estimatedMs);
    AudioService.speak(greetingMsg, 'en', () => {
      window.clearTimeout(fallback);
      setIsSpeaking(false);
    });
  };

  const handleSpotlight = (e) => {
    if (!spotlightRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    spotlightRef.current.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    spotlightRef.current.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    tiltX.set(((e.clientX - cx) / rect.width) * 14);
    tiltY.set(((e.clientY - cy) / rect.height) * 14);
  };

  const handleHeroLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  let content;

  if (activeSubView === 'games') {
    content = <GameShell session={session} onBack={() => setActiveSubView('home')} />;
  } else if (activeSubView === 'memories') {
    content = <MemoryJournalView session={session} onBack={() => setActiveSubView('home')} onOpenVoiceAssistant={() => setIsAssistantOpen(true)} />;
  } else if (activeSubView === 'reminders') {
    content = <RemindersView session={session} onBack={() => setActiveSubView('home')} />;
  } else if (activeSubView === 'caregivers') {
    content = <CaregiverConnectionsView session={session} onBack={() => setActiveSubView('home')} />;
  } else {
    content = (
    <div ref={containerRef}>
      {/* ── HERO — identity + voice as one interactive object ────────── */}
      <section ref={heroRef} className="stage overflow-hidden" onMouseMove={handleSpotlight} onMouseLeave={handleHeroLeave}>
        <div ref={spotlightRef} className="spotlight" />

        <div className="rail-pad content-col relative z-10 pt-24 pb-5 md:pt-32 md:pb-10">
          {locationTracking && <LocationSharingBanner tracking={locationTracking} t={t} />}
          <div className="grid lg:grid-cols-[1.15fr_0.7fr] gap-8 lg:gap-12 items-center">
            <div className="scroll-reveal">
              <h1
                className="font-display font-medium leading-[0.94] text-[clamp(2.6rem,7vw,5.6rem)]"
                style={{ letterSpacing: '-0.02em' }}
              >
                {getGreetingTime()}
                <br />
                <em className="italic text-ember">{userName}</em>
              </h1>
              <div className="flex flex-wrap items-center gap-5 mt-6">
                <button type="button" onClick={handleSpeakGreeting} className="btn btn-quiet !px-0">
                  <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-soft-pulse' : ''}`} /> {isSpeaking ? t('speakingEllipsis') : t('listenToGreeting')}
                </button>
              </div>
            </div>

            {/* Identity + voice — one merged, tactile object */}
            <div className="justify-self-center lg:justify-self-end reveal-scale scroll-reveal" data-reveal-delay="1">
              <motion.div style={{ x: tiltXSpring, y: tiltYSpring }} className="relative w-48 h-48 md:w-60 md:h-60">
                <div
                  className="absolute -inset-4 rounded-full"
                  style={{ background: 'conic-gradient(from 220deg, var(--ember), transparent 40%, var(--jade), transparent 80%)', opacity: 0.35, filter: 'blur(2px)' }}
                />
                <motion.div style={{ y: portraitY, opacity: portraitOpacity }} className={`${isPhotoAvatar(session?.avatar) ? 'duotone' : ''} relative w-full h-full rounded-full overflow-hidden avatar-ring`}>
                  <UserAvatar avatar={session?.avatar} fullName={userName} className="w-full h-full object-cover" iconClassName="w-1/3 h-1/3" />
                </motion.div>

                <div className="absolute -bottom-3 -right-3 md:-bottom-4 md:-right-4">
                  <Magnetic strength={0.3}>
                    <VoiceOrb speaking={isSpeaking} onActivate={() => setIsAssistantOpen(true)} />
                  </Magnetic>
                </div>
              </motion.div>
              <p className="text-center text-xs font-medium mt-3 text-ink-faint">
                {t('tapToAsk')}
              </p>
            </div>
          </div>
        </div>

        {/* Connective tissue into the next section */}
        <motion.div style={{ opacity: nextTaskOpacity, y: nextTaskY }} className="rail-pad content-col pt-1 pb-9 relative z-10 reveal-left scroll-reveal" data-reveal-delay="2">
          {!isLoadingReminders && (
            nextTask ? (
              <div className="notice-strip is-jade flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-xs font-semibold uppercase text-jade">{t('nextLabel')} · {formatTime12h(nextTask.time)}</span>
                  <span className="font-display text-lg md:text-xl font-medium truncate">{nextTask.icon} {nextTask.title}</span>
                </div>
                <button type="button" onClick={() => setActiveSubView('reminders')} className="btn btn-quiet shrink-0 !px-0 text-jade">
                  {t('markComplete')} <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="notice-strip is-jade flex items-center justify-between gap-4">
                <span className="text-sm text-ink-faint">{t('noUpcomingReminders')}</span>
                <button type="button" onClick={() => setActiveSubView('reminders')} className="btn btn-quiet shrink-0 !px-0 text-jade">
                  {t('addReminder')} <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            )
          )}
        </motion.div>
      </section>

      <div className="rail-pad content-col"><div className="fade-divider" /></div>

      {/* ── ACTIVITIES — featured object + interactive index ─────────── */}
      <section className="rail-pad content-col py-14 md:py-20 section-ambient">
        <div className="flex items-end justify-between mb-6 scroll-reveal">
          <h2 className="font-display text-2xl md:text-3xl font-medium">{t('dailyActivities')}</h2>
          {reminders.length > 0 && (
            <span className="text-xs font-medium hidden sm:block text-ink-faint">{completedCount}/{reminders.length} {t('doneTodaySuffix')}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setActiveSubView('games')}
          className="group relative w-full rounded-[var(--radius-lg)] overflow-hidden text-left reveal-scale scroll-reveal transition-[transform,box-shadow] duration-300 hover:-translate-y-1"
          data-reveal-delay="1"
          style={{ minHeight: '18rem', boxShadow: 'var(--shadow-sm)' }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
        >
          <div
            className="absolute inset-0 transition-transform duration-700 group-hover:scale-105"
            style={{
              background:
                'radial-gradient(60rem 30rem at 85% 20%, rgba(226,112,58,0.35), transparent 55%), radial-gradient(50rem 40rem at 10% 100%, rgba(79,174,142,0.28), transparent 55%), var(--canvas-raised)'
            }}
          />
          <div className="relative h-full flex flex-col justify-between p-7 md:p-10" style={{ minHeight: '18rem' }}>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{t('cognitiveExercise')}</span>
              <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0 -rotate-90">
                <circle cx="22" cy="22" r="20" fill="none" stroke="var(--hairline-strong)" strokeWidth="3" />
                <circle
                  cx="22" cy="22" r="20" fill="none" stroke="var(--ember)" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={RING_CIRCUMFERENCE * (1 - todayFraction)}
                />
              </svg>
            </div>
            <div className="flex items-end justify-between gap-6">
              <h3 className="font-display font-medium text-[clamp(2rem,5vw,3.6rem)] leading-[0.95]">
                {LocalizationService.getText('playAGame', currentLang)}
              </h3>
              <Magnetic strength={0.35}>
                <span className="trigger-btn shrink-0" style={{ background: 'var(--ember)', borderColor: 'var(--ember)', color: '#1a0f08' }}>
                  <ArrowUpRight className="w-5 h-5" />
                </span>
              </Magnetic>
            </div>
          </div>
        </button>

        <div className="index-list mt-4 scroll-reveal" data-reveal-delay="2">
          <button type="button" onClick={() => setActiveSubView('memories')} className="index-row">
            <span className="index-num">01</span>
            <span className="index-icon">📝</span>
            <span className="flex-1 min-w-0">
              <span className="font-display text-xl md:text-2xl font-medium block">{LocalizationService.getText('myMemories', currentLang)}</span>
              <span className="index-desc text-sm block mt-0.5 text-ink-faint">{t('memoriesDesc')}</span>
            </span>
            <ArrowUpRight className="index-arrow w-5 h-5" />
          </button>

          <button type="button" onClick={() => setActiveSubView('reminders')} className="index-row">
            <span className="index-num">02</span>
            <span className="index-icon">🔔</span>
            <span className="flex-1 min-w-0">
              <span className="font-display text-xl md:text-2xl font-medium block">{LocalizationService.getText('myReminders', currentLang)}</span>
              <span className="index-desc text-sm block mt-0.5 text-ink-faint">{t('remindersDesc')}</span>
            </span>
            {reminders.length > 0 && (
              <span className="hidden sm:flex items-center gap-2 shrink-0 text-ink-faint">
                <svg width="26" height="26" viewBox="0 0 26 26" className="-rotate-90">
                  <circle cx="13" cy="13" r="11" fill="none" stroke="var(--hairline-strong)" strokeWidth="2.5" />
                  <circle
                    cx="13" cy="13" r="11" fill="none" stroke="var(--jade)" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 11} strokeDashoffset={2 * Math.PI * 11 * (1 - todayFraction)}
                  />
                </svg>
                <span className="text-xs font-semibold">{completedCount}/{reminders.length}</span>
              </span>
            )}
            <ArrowUpRight className="index-arrow w-5 h-5" />
          </button>

          <button type="button" onClick={() => setActiveSubView('caregivers')} className="index-row">
            <span className="index-num">03</span>
            <span className="index-icon">🤝</span>
            <span className="flex-1 min-w-0">
              <span className="font-display text-xl md:text-2xl font-medium block">{t('navMyCaregivers')}</span>
              <span className="index-desc text-sm block mt-0.5 text-ink-faint">{t('myCaregiversDesc')}</span>
            </span>
            <ArrowUpRight className="index-arrow w-5 h-5" />
          </button>

          <button type="button" onClick={handleCallCaregiver} disabled={isFindingCaregiver} className="index-row">
            <span className="index-num">04</span>
            <span className="index-icon" style={{ background: 'var(--alert-soft)', color: 'var(--alert)' }}><PhoneCall className="w-4.5 h-4.5" /></span>
            <span className="flex-1 min-w-0">
              <span className="font-display text-xl md:text-2xl font-medium block text-alert">{t('callCaregiver')}</span>
              <span className="index-desc text-sm block mt-0.5 text-ink-faint">{t('callCaregiverDesc')}</span>
            </span>
            <ArrowUpRight className="index-arrow w-5 h-5" />
          </button>
        </div>

        <div className={callNotice ? 'mt-4' : ''}>
          <InlineNotice tone={callNotice?.tone} message={callNotice?.message} onDismiss={() => setCallNotice(null)} autoDismissMs={9000} />
        </div>
        <CaregiverCallDialog
          isOpen={isCallOpen}
          name={callTarget?.name}
          phone={callTarget?.phone}
          onClose={() => setIsCallOpen(false)}
          onResult={(result) => { if (!result.ok) setCallNotice({ tone: 'error', message: t('callFailedError') }); }}
        />
      </section>

      <nav className="rail-pad content-col pb-20 grid grid-cols-2 sm:flex sm:items-center gap-x-8 gap-y-4 scroll-reveal" aria-label={t('elderShortcutsAria')} style={{ borderTop: '1px solid var(--hairline)', paddingTop: '2rem' }}>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-ink" aria-current="page"><Home className="w-4 h-4" /> {t('navHome')}</button>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft" onClick={() => setActiveSubView('games')}><Brain className="w-4 h-4" /> {t('navGames')}</button>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft" onClick={() => setActiveSubView('memories')}><BookOpen className="w-4 h-4" /> {t('navMemories')}</button>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft" onClick={() => setActiveSubView('reminders')}><Bell className="w-4 h-4" /> {t('navReminders')}</button>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft" onClick={() => setActiveSubView('caregivers')}><Users className="w-4 h-4" /> {t('navMyCaregivers')}</button>
      </nav>

      <VoiceAssistantModal
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        onOpenGame={() => { setIsAssistantOpen(false); setActiveSubView('games'); }}
      />
    </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key={activeSubView} {...pageTransition}>
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

// A safety-focused first-time prompt, a small persistent "sharing active"
// indicator once granted, or a clear recovery message if permission is
// missing/denied — never a silent failure. Transient states (checking an
// already-decided permission, a momentary GPS timeout) render nothing so
// this stays unobtrusive rather than flickering on every render.
function LocationSharingBanner({ tracking, t }) {
  const { status, enableSharing, disableSharing, dismissPrompt } = tracking;

  if (status === 'prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="notice-box is-jade flex flex-col sm:flex-row sm:items-center gap-4 justify-between mb-6"
      >
        <div className="flex items-start gap-3 min-w-0">
          <MapPin className="w-4.5 h-4.5 mt-0.5 shrink-0 text-jade" />
          <div className="min-w-0">
            <p className="font-display text-lg font-medium">{t('locationPermissionTitle')}</p>
            <p className="text-sm mt-1 leading-relaxed text-ink-soft">{t('locationPermissionDesc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <button type="button" onClick={dismissPrompt} className="btn btn-quiet">{t('notNowLabel')}</button>
          <button type="button" onClick={enableSharing} className="btn btn-ember">{t('enableLocationSharingLabel')}</button>
        </div>
      </motion.div>
    );
  }

  if (status === 'granted') {
    return (
      <div className="flex items-center gap-3 text-sm font-medium mb-6 text-jade">
        <span className="w-2 h-2 rounded-full animate-soft-pulse" style={{ background: 'var(--jade)' }} />
        {t('locationSharingActiveLabel')}
        <button type="button" onClick={disableSharing} className="btn btn-quiet !px-0 !min-h-0 text-xs text-ink-faint">
          {t('disableLocationSharingLabel')}
        </button>
      </div>
    );
  }

  if (status === 'denied' || status === 'unavailable') {
    return (
      <div className="notice-strip is-alert flex items-start gap-3 mb-6">
        <ShieldAlert className="w-4.5 h-4.5 mt-0.5 shrink-0 text-alert" />
        <p className="text-sm leading-relaxed text-ink-soft">{t('locationUnavailableMessage')}</p>
      </div>
    );
  }

  // Transient (GPS timeout / no signal) — the watcher keeps retrying on
  // its own, so this stays a small note rather than an alarming banner,
  // but it's still surfaced rather than failing silently.
  if (status === 'error') {
    return (
      <div className="flex items-center gap-3 text-sm mb-6 text-ink-faint">
        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--ember)' }} />
        {t('locationErrorMessage')}
      </div>
    );
  }

  return null;
}
