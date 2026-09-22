import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import CognitiveAnalytics from './CognitiveAnalytics';
import ExplainableInsightsView from './ExplainableInsightsView';
import RoutineManager from './RoutineManager';
import ConnectElderPanel from './ConnectElderPanel';
import ElderLocationView from './ElderLocationView';
import { ReminderService } from '../../services/reminderService';
import { REMINDER_COMPLETED_EVENT } from '../../services/reminderAlertEngine';
import { MemoryService } from '../../services/memoryService';
import { CaregiverConnectionService } from '../../services/caregiverConnectionService';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { pageTransition } from '../common/pageTransition';
import UserAvatar from '../common/UserAvatar';
import NotificationPermissionBanner from '../common/NotificationPermissionBanner';
import { useTranslation } from '../../hooks/useTranslation';
import { BarChart3, Lightbulb, Bell, ShieldAlert, Link2, Users, MapPin } from 'lucide-react';

export default function CaregiverDashboard({ session }) {
  const { t } = useTranslation();
  const ownName = session?.fullName || t('guestLabel');
  const [activeTab, setActiveTab] = useState('insights');
  useBackButton(() => { setActiveTab('insights'); return true; }, { enabled: activeTab !== 'insights', priority: BACK_PRIORITY.SUBVIEW });

  const [connections, setConnections] = useState([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState('');
  const [selectedElderId, setSelectedElderId] = useState(null);

  const [routines, setRoutines] = useState([]);
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(true);
  const [routinesError, setRoutinesError] = useState('');
  const [memories, setMemories] = useState([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(true);
  const containerRef = useScrollReveal();

  const loadConnections = useCallback(async () => {
    if (!session?.id) {
      setIsLoadingConnections(false);
      return;
    }
    setIsLoadingConnections(true);
    setConnectionsError('');
    const result = await CaregiverConnectionService.listEldersForCaregiver(session.id);
    if (!result.ok) {
      setConnectionsError(t('connectionsLoadError'));
      setIsLoadingConnections(false);
      return;
    }
    setConnections(result.connections);
    setIsLoadingConnections(false);
  }, [session?.id, t]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const acceptedElders = connections.filter((c) => c.status === 'accepted');
  const connectedElder = acceptedElders.find((c) => c.elder?.id === selectedElderId)?.elder || acceptedElders[0]?.elder || null;

  useEffect(() => {
    if (acceptedElders.length > 0 && !acceptedElders.some((c) => c.elder?.id === selectedElderId)) {
      setSelectedElderId(acceptedElders[0].elder?.id || null);
    }
  }, [acceptedElders, selectedElderId]);

  const activeUserId = connectedElder?.id || null;
  const displayName = connectedElder?.fullName || ownName;
  const displayAvatar = connectedElder ? connectedElder.avatar : session?.avatar;

  const loadRoutines = useCallback(async () => {
    if (!activeUserId) {
      setRoutines([]);
      setIsLoadingRoutines(false);
      return;
    }
    setIsLoadingRoutines(true);
    setRoutinesError('');
    const result = await ReminderService.listReminders(activeUserId);
    if (!result.ok) {
      setRoutinesError(result.error || t('remindersLoadError'));
      setIsLoadingRoutines(false);
      return;
    }
    setRoutines(result.reminders);
    setIsLoadingRoutines(false);
  }, [activeUserId, t]);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  // The reminder alert (mounted app-wide) marks a reminder complete straight
  // through ReminderService — this re-fetches so a completion acknowledged
  // from the popup (which can appear over this dashboard for any connected
  // elder, not just the one currently selected) shows up here too.
  useEffect(() => {
    const onCompleted = (event) => {
      if (event.detail?.ownerId === activeUserId) loadRoutines();
    };
    window.addEventListener(REMINDER_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(REMINDER_COMPLETED_EVENT, onCompleted);
  }, [activeUserId, loadRoutines]);

  useEffect(() => {
    if (!activeUserId) {
      setMemories([]);
      setIsLoadingMemories(false);
      return;
    }
    setIsLoadingMemories(true);
    MemoryService.listMemories(activeUserId).then((result) => {
      setMemories(result.ok ? result.memories : []);
      setIsLoadingMemories(false);
    });
  }, [activeUserId]);

  const completedToday = routines.filter((r) => r.isCompleted).length;

  const tabs = [
    { id: 'insights', labelKey: 'tabAiInsights', icon: Lightbulb },
    { id: 'analytics', labelKey: 'tabCognitiveAnalytics', icon: BarChart3 },
    { id: 'routines', labelKey: 'tabRoutines', icon: Bell },
    { id: 'location', labelKey: 'tabElderLocation', icon: MapPin },
    { id: 'connect', labelKey: 'tabConnectElder', icon: Link2 }
  ];

  const noElderNotice = (
    <div className="panel-light p-8 sm:p-10 text-center space-y-4 max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(226,112,58,0.15)', color: 'var(--ember-deep)' }}>
        <Users className="w-6 h-6" />
      </div>
      <div>
        <h4 className="font-display text-xl font-medium">{t('noElderConnectedTitle')}</h4>
        <p className="text-sm mt-1.5" style={{ color: 'rgba(23,20,15,0.6)' }}>{t('noElderConnectedDesc')}</p>
      </div>
      <button type="button" onClick={() => setActiveTab('connect')} className="btn btn-on-light">
        <Link2 className="w-4 h-4" /> {t('tabConnectElder')}
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="page">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 scroll-reveal border-b border-hairline">
        {/* w-full on mobile: the parent is `items-start` in its column
            layout, so without it this box sizes to its content and the
            h1's `truncate` has nothing to truncate against — a long elder
            name then runs off the right edge instead of ellipsizing. */}
        <div className="flex items-center gap-5 min-w-0 w-full md:w-auto">
          <UserAvatar avatar={displayAvatar} fullName={displayName} className="avatar-ring w-16 h-16 rounded-full overflow-hidden object-cover shrink-0" iconClassName="w-1/3 h-1/3" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl font-medium mt-2 truncate">
              {t('monitoring')} <em className="italic text-ember">{displayName}</em>
            </h1>
            {acceptedElders.length > 1 && (
              <select
                value={selectedElderId || ''}
                onChange={(e) => setSelectedElderId(e.target.value)}
                className="select mt-2 !w-auto"
                aria-label={t('switchElderLabel')}
              >
                {acceptedElders.map((c) => (
                  <option key={c.elder.id} value={c.elder.id}>{c.elder.fullName}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {connectedElder && !isLoadingRoutines && routines.length > 0 && (
          <div className="flex items-center gap-8 shrink-0">
            <div className="figure"><span className="figure-label">{t('todayLabel')}</span><span className="figure-value text-jade">{completedToday}/{routines.length}</span></div>
          </div>
        )}
      </div>

      <div className="notice-strip is-ember flex items-center gap-3 my-8 scroll-reveal" data-reveal-delay="1">
        <ShieldAlert className="w-4.5 h-4.5 shrink-0 text-ember" />
        <p className="text-sm leading-relaxed text-ink-soft">
          {t('caregiverDisclaimer')}
        </p>
      </div>

      <div className="relative flex items-center gap-8 mb-10 scroll-reveal tab-strip border-b border-hairline" data-reveal-delay="2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`tab-link flex items-center gap-2 shrink-0 ${isActive ? 'is-active' : ''}`}>
              <Icon className="w-4 h-4" /> {t(tab.labelKey)}
              {isActive && <motion.span layoutId="caregiver-tab" className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ background: 'var(--ember)' }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} />}
            </button>
          );
        })}
      </div>

      <div className="scroll-reveal" data-reveal-delay="3">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} {...pageTransition}>
            {activeTab === 'insights' && (
              connectedElder ? (
                <ExplainableInsightsView
                  userName={displayName}
                  memories={memories}
                  isLoadingMemories={isLoadingMemories}
                  routines={routines}
                  isLoadingRoutines={isLoadingRoutines}
                />
              ) : noElderNotice
            )}
            {activeTab === 'analytics' && (connectedElder ? <CognitiveAnalytics elderId={connectedElder.id} userName={displayName} /> : noElderNotice)}
            {activeTab === 'routines' && (
              connectedElder ? (
                <>
                  <NotificationPermissionBanner session={session} />
                  <RoutineManager
                    session={session}
                    userName={displayName}
                    routines={routines}
                    setRoutines={setRoutines}
                    isLoading={isLoadingRoutines}
                    loadError={routinesError}
                    onRetry={loadRoutines}
                    readOnly
                  />
                </>
              ) : noElderNotice
            )}
            {activeTab === 'location' && (
              connectedElder ? <ElderLocationView elder={connectedElder} /> : noElderNotice
            )}
            {activeTab === 'connect' && (
              <ConnectElderPanel
                session={session}
                connections={connections}
                isLoading={isLoadingConnections}
                loadError={connectionsError}
                onRetry={loadConnections}
                onConnected={loadConnections}
                onDisconnected={() => loadConnections()}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
