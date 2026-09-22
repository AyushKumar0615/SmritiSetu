import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import ImpactDashboard from './ImpactDashboard';
import AdminSidebar from './AdminSidebar';
import StatCard from './StatCard';
import { AdminService, formatDateTime } from '../../services/adminService';
import { LocationService } from '../../services/locationService';
import { GAME_CATALOG } from '../../data/gameCatalog';
import LocationMap from '../common/LocationMap';
import { useTranslation } from '../../hooks/useTranslation';
import ConfirmDialog from '../common/ConfirmDialog';
import InlineNotice from '../common/InlineNotice';
import { SkeletonList } from '../common/Skeleton';
import ThemeToggle from '../common/ThemeToggle';
import StatusBadge, { LOCATION_STATUS_TONES } from '../common/StatusBadge';
import {
  Shield, Users, HeartPulse, LayoutDashboard, ChevronDown, UserRound,
  Search, UserCheck, UserX, Link2, MapPin, Clock, Navigation, Menu,
  Zap, UserPlus2, BarChart3, ChevronRight, Gamepad2, Database, Fingerprint
} from 'lucide-react';

const ROLE_LABEL_KEYS = { elderly: 'modeElderlyLabel', caregiver: 'modeCaregiverLabel', admin: 'modeAdminLabel' };
const ROLE_ICONS = { elderly: HeartPulse, caregiver: LayoutDashboard, admin: Shield };
const ROLE_BADGE_TONES = { elderly: 'ember', caregiver: 'sky', admin: 'violet' };
const CONNECTION_STATUS_KEYS = { pending: 'pendingApprovalNotice', accepted: 'statusAcceptedLabel', rejected: 'statusRejectedLabel' };
const LOCATION_STATUS_KEYS = { live: 'locationStatusLive', recent: 'locationStatusRecent', offline: 'locationStatusOffline' };

// role -> tab id (also doubles as the roleFilter value AdminService.listUsers
// already accepts — the sidebar's "Elders"/"Caregivers" links and these tabs
// drive the exact same piece of state, never two competing filters).
const ROLE_TABS = [
  { id: '', labelKey: 'allRolesOption' },
  { id: 'elderly', labelKey: 'modeElderlyLabel' },
  { id: 'caregiver', labelKey: 'modeCaregiverLabel' },
  { id: 'admin', labelKey: 'modeAdminLabel' }
];

export default function AdminPortal({ session, onLogout, theme, onToggleTheme }) {
  const { t } = useTranslation();

  // Bumped after a user-management mutation (activate/deactivate,
  // disconnect) so the dashboard counters above refetch without a
  // full page reload.
  const [statsVersion, setStatsVersion] = useState(0);
  const bumpStats = useCallback(() => setStatsVersion((v) => v + 1), []);

  // Lifted out of the tabs/search controls below so the sidebar's
  // "Elders"/"Caregivers" links and the top header's search field can drive
  // the exact same live filter — one source of truth, not a second one that
  // only looks connected.
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useBackButton(() => { setMobileNavOpen(false); return true; }, { enabled: mobileNavOpen, priority: BACK_PRIORITY.OVERLAY });

  const topRef = useRef(null);
  const userMgmtRef = useRef(null);
  const auditRef = useRef(null);
  const analyticsRef = useRef(null);

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Only 'dashboard', 'elders', 'caregivers', 'connections' and 'analytics'
  // map to something real (a filter + scroll, or a scroll, to content that
  // already exists on this single-page dashboard). 'content' and 'settings'
  // have no corresponding feature anywhere in the app, so they render in the
  // sidebar for layout fidelity but intentionally do nothing when clicked —
  // see AdminSidebar's NAV_ITEMS comment.
  const handleNavigate = (id) => {
    if (id === 'dashboard') { scrollTo(topRef); return; }
    if (id === 'elders') { setRoleFilter('elderly'); scrollTo(userMgmtRef); return; }
    if (id === 'caregivers') { setRoleFilter('caregiver'); scrollTo(userMgmtRef); return; }
    if (id === 'connections') { setRoleFilter(''); scrollTo(userMgmtRef); return; }
    if (id === 'analytics') { scrollTo(analyticsRef); return; }
  };

  const [platformStats, setPlatformStats] = useState(null);
  const [isLoadingPlatformStats, setIsLoadingPlatformStats] = useState(true);
  const [platformStatsError, setPlatformStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPlatformStats(true);
    AdminService.getPlatformStats().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPlatformStats(result.stats);
        setPlatformStatsError(false);
      } else {
        setPlatformStatsError(true);
      }
      setIsLoadingPlatformStats(false);
    });
    return () => { cancelled = true; };
  }, [statsVersion]);

  const [activity, setActivity] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [activityError, setActivityError] = useState('');

  const loadActivity = useCallback(async () => {
    setIsLoadingActivity(true);
    setActivityError('');
    const result = await AdminService.getRecentActivity();
    if (!result.ok) {
      setActivityError(t('adminLoadError'));
      setIsLoadingActivity(false);
      return;
    }
    setActivity(result.events);
    setIsLoadingActivity(false);
  }, [t]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const describeEvent = (event) => {
    if (event.kind === 'reminder') return t('activityAddedReminder').replace('{title}', event.title);
    if (event.kind === 'memory') return t('activityAddedMemory').replace('{title}', event.title);
    return t('activityConnectionAccepted').replace('{caregiver}', event.caregiverName).replace('{elder}', event.elderName);
  };

  const roleLabelFor = (actor) => {
    if (!actor) return '';
    const key = ROLE_LABEL_KEYS[(actor.role || '').trim().toLowerCase()];
    return key ? t(key) : actor.role;
  };

  // A real, if approximate, health signal for the System Status card: it
  // reflects whether this session's own admin data fetches are actually
  // succeeding, rather than a hard-coded "everything's fine". The app has
  // no per-service (DB/auth/storage/realtime) health-check backend, and
  // building one solely for this card was explicitly out of scope — so
  // only the two categories with a genuine signal are shown. See the
  // redesign report for the full reasoning.
  const [usersLoadFailed, setUsersLoadFailed] = useState(false);
  const databaseHealthy = !platformStatsError && !usersLoadFailed && !activityError;
  const allSystemsHealthy = databaseHealthy; // authentication is always true when this page renders at all

  const firstName = (session?.fullName || '').trim().split(/\s+/)[0] || t('adminRoleLabel');

  return (
    <div className="admin-shell">
      <AdminSidebar
        t={t}
        activeSection="dashboard"
        onNavigate={handleNavigate}
        session={session}
        onLogout={onLogout}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0">
        <div className="admin-topbar-mobile">
          <button type="button" onClick={() => setMobileNavOpen(true)} className="btn-icon" aria-label={t('openAdminMenuAria')}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-semibold">Smriti<em className="italic text-ember">Setu</em></span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <div ref={topRef} className="admin-main">
          <div className="admin-header-row">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-medium leading-tight">
                {t('adminWelcomeBack').replace('{name}', firstName)}
              </h1>
              <p className="text-sm mt-1.5 text-ink-faint">{t('adminWelcomeSubtitle')}</p>
            </div>
            <div className="admin-header-controls">
              <div className="admin-search">
                <Search className="w-4 h-4 text-ink-faint shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('adminSearchPlaceholder')}
                />
              </div>
              <span className="hidden lg:flex items-center gap-2.5">
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                <button type="button" onClick={() => scrollTo(auditRef)} className="btn-icon" aria-label={t('auditTrailTitle')}>
                  <Shield className="w-4.5 h-4.5" />
                </button>
              </span>
            </div>
          </div>

          <div className="admin-stat-grid">
            <StatCard icon={HeartPulse} tone="ember" isLoading={isLoadingPlatformStats}
              value={platformStats?.totalElders.toLocaleString()} label={t('statTotalElders')} />
            <StatCard icon={Users} tone="sky" isLoading={isLoadingPlatformStats}
              value={platformStats?.totalCaregivers.toLocaleString()} label={t('statTotalCaregivers')} />
            <StatCard icon={Link2} tone="violet" isLoading={isLoadingPlatformStats}
              value={platformStats?.activeConnections.toLocaleString()} label={t('statActiveConnections')} />
            <StatCard icon={Gamepad2} tone="jade" isLoading={false}
              value={GAME_CATALOG.length} label={t('statGamesAvailable')} />
          </div>

          <div className="admin-two-col">
            <div ref={userMgmtRef} className="admin-card">
              <UserManagementSection
                t={t}
                onMutation={bumpStats}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
                search={search}
                setSearch={setSearch}
                onLoadFailedChange={setUsersLoadFailed}
              />
            </div>

            <div className="space-y-5">
              <QuickActionsCard
                t={t}
                onViewElders={() => handleNavigate('elders')}
                onViewCaregivers={() => handleNavigate('caregivers')}
                onViewAnalytics={() => handleNavigate('analytics')}
                onViewAudit={() => scrollTo(auditRef)}
              />
              <SystemStatusCard t={t} databaseHealthy={databaseHealthy} allHealthy={allSystemsHealthy} />
            </div>
          </div>

          <div ref={auditRef} className="admin-card mt-5">
            <div className="admin-card-header">
              <div className="flex items-start gap-3.5">
                <span className="admin-card-icon"><Shield className="w-5 h-5" /></span>
                <div>
                  <h2 className="admin-card-title">{t('auditTrailTitle')}</h2>
                  <p className="admin-card-subtitle">{t('auditTrailSubtitle')}</p>
                </div>
              </div>
            </div>
            {isLoadingActivity ? (
              <SkeletonList rows={4} label={t('adminLoadingLabel')} />
            ) : activityError ? (
              <div className="notice-strip is-alert flex items-center justify-between gap-4">
                <p className="text-sm text-alert">{activityError}</p>
                <button type="button" onClick={loadActivity} className="btn btn-line shrink-0">{t('retry')}</button>
              </div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-ink-faint">{t('noActivityYet')}</p>
            ) : (
              <div className="overflow-x-auto -mx-1.5">
                <table className="w-full text-left text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-ink-faint" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th className="font-semibold px-1.5 pb-3">{t('colTimestamp')}</th>
                      <th className="font-semibold px-1.5 pb-3">{t('colUserRole')}</th>
                      <th className="font-semibold px-1.5 pb-3">{t('colAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((event) => (
                      <tr key={event.id} className="border-hairline" style={{ borderTop: '1px solid var(--hairline)' }}>
                        <td className="font-mono text-xs whitespace-nowrap px-1.5 py-3 text-ink-faint">{formatDateTime(event.timestamp)}</td>
                        <td className="font-semibold whitespace-nowrap px-1.5 py-3">{event.actor?.full_name}{event.actor ? ` (${roleLabelFor(event.actor)})` : ''}</td>
                        <td className="px-1.5 py-3 text-ink-soft">{describeEvent(event)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div ref={analyticsRef} className="mt-5">
            <ImpactDashboard refreshSignal={statsVersion} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard({ t, onViewElders, onViewCaregivers, onViewAnalytics, onViewAudit }) {
  const actions = [
    { icon: UserPlus2, tone: 'ember', titleKey: 'qaViewEldersTitle', descKey: 'qaViewEldersDesc', onClick: onViewElders },
    { icon: Users, tone: 'sky', titleKey: 'qaViewCaregiversTitle', descKey: 'qaViewCaregiversDesc', onClick: onViewCaregivers },
    { icon: BarChart3, tone: 'violet', titleKey: 'qaViewAnalyticsTitle', descKey: 'qaViewAnalyticsDesc', onClick: onViewAnalytics },
    { icon: Shield, tone: 'jade', titleKey: 'qaViewAuditTitle', descKey: 'qaViewAuditDesc', onClick: onViewAudit }
  ];
  const TONE_STYLES = {
    ember: { background: 'var(--ember-soft)', color: 'var(--ember)' },
    sky: { background: 'var(--sky-soft)', color: 'var(--sky)' },
    violet: { background: 'var(--violet-soft)', color: 'var(--violet)' },
    jade: { background: 'var(--jade-soft)', color: 'var(--jade)' }
  };
  return (
    <div className="admin-card">
      <div className="admin-card-header !mb-3">
        <div className="flex items-start gap-3.5">
          <span className="admin-card-icon"><Zap className="w-5 h-5" /></span>
          <div>
            <h2 className="admin-card-title">{t('quickActionsTitle')}</h2>
            <p className="admin-card-subtitle">{t('quickActionsSubtitle')}</p>
          </div>
        </div>
      </div>
      <div>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button key={a.titleKey} type="button" onClick={a.onClick} className="admin-quick-action">
              <span className="admin-quick-action-icon" style={TONE_STYLES[a.tone]}><Icon className="w-4.5 h-4.5" /></span>
              <span className="flex-1 min-w-0 text-left">
                <span className="text-sm font-semibold block">{t(a.titleKey)}</span>
                <span className="text-xs block mt-0.5 text-ink-faint truncate">{t(a.descKey)}</span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-ink-faint" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SystemStatusCard({ t, databaseHealthy, allHealthy }) {
  return (
    <div className="admin-card">
      <div className="admin-card-header !mb-3">
        <div className="flex items-start gap-3.5">
          <span className="admin-card-icon"><Database className="w-5 h-5" /></span>
          <div>
            <h2 className="admin-card-title">{t('systemStatusTitle')}</h2>
            <p className="admin-card-subtitle">{allHealthy ? t('systemStatusAllOperational') : t('systemStatusIssues')}</p>
          </div>
        </div>
        <StatusBadge tone={allHealthy ? 'jade' : 'alert'} dot>
          {t(allHealthy ? 'allSystemsOnlineLabel' : 'systemIssuesLabel')}
        </StatusBadge>
      </div>
      <div>
        <div className="admin-status-row">
          <span className="flex items-center gap-2.5"><Database className="w-4 h-4 text-ink-faint" /> {t('systemStatusDatabase')}</span>
          <StatusBadge tone={databaseHealthy ? 'jade' : 'alert'} dot>{t(databaseHealthy ? 'operationalLabel' : 'systemIssuesLabel')}</StatusBadge>
        </div>
        <div className="admin-status-row">
          <span className="flex items-center gap-2.5"><Fingerprint className="w-4 h-4 text-ink-faint" /> {t('systemStatusAuth')}</span>
          <StatusBadge tone="jade" dot>{t('operationalLabel')}</StatusBadge>
        </div>
      </div>
    </div>
  );
}

function UserManagementSection({ t, onMutation, roleFilter, setRoleFilter, search, setSearch, onLoadFailedChange }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    const result = await AdminService.listUsers({ search, roleFilter, statusFilter, page });
    if (!result.ok) {
      setLoadError(t('adminLoadError'));
      setIsLoading(false);
      onLoadFailedChange?.(true);
      return;
    }
    setUsers(result.users);
    setTotal(result.total);
    setPageSize(result.pageSize);
    setIsLoading(false);
    onLoadFailedChange?.(false);
  }, [search, roleFilter, statusFilter, page, t, onLoadFailedChange]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Reset to page 0 whenever a filter changes, so a narrower result set
  // never leaves the view stuck on a now-empty later page.
  useEffect(() => {
    setPage(0);
  }, [search, roleFilter, statusFilter]);

  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const toggleUserActive = async (user) => {
    const result = await AdminService.setUserActive(user.id, !user.is_active);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t('adminActionError') });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: !user.is_active } : u)));
    setNotice({ tone: 'success', message: t(user.is_active ? 'userDeactivatedNotice' : 'userActivatedNotice') });
    onMutation?.();
  };

  const confirmDisconnect = async () => {
    if (!disconnectTarget) return;
    const result = await AdminService.disconnectConnection(disconnectTarget.id);
    setDisconnectTarget(null);
    if (!result.ok) {
      setNotice({ tone: 'error', message: t('adminActionError') });
      return;
    }
    setNotice({ tone: 'info', message: t('connectionRemovedNotice') });
    onMutation?.();
    setDetailRefreshKey((k) => k + 1);
  };

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = page + 1;

  return (
    <div>
      <div className="admin-card-header">
        <div className="flex items-start gap-3.5">
          <span className="admin-card-icon"><UserRound className="w-5 h-5" /></span>
          <div>
            <h2 className="admin-card-title">{t('userManagementTitle')}</h2>
            <p className="admin-card-subtitle">{t('userManagementSubtitle')}</p>
          </div>
        </div>
      </div>

      <InlineNotice tone={notice?.tone} message={notice?.message} onDismiss={() => setNotice(null)} />

      <div className="admin-tabs" role="tablist">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.id || 'all'}
            type="button"
            role="tab"
            aria-selected={roleFilter === tab.id}
            onClick={() => setRoleFilter(tab.id)}
            className={`tab-link ${roleFilter === tab.id ? 'is-active' : ''}`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchUsersPlaceholder')}
            className="input !pl-6"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select sm:!w-44" aria-label={t('filterByStatusAria')}>
          <option value="">{t('allStatusesOption')}</option>
          <option value="active">{t('statusActiveLabel')}</option>
          <option value="inactive">{t('statusInactiveLabel')}</option>
        </select>
      </div>

      {isLoading ? (
        <SkeletonList rows={5} label={t('adminLoadingLabel')} />
      ) : loadError ? (
        <div className="notice-strip is-alert flex items-center justify-between gap-4">
          <p className="text-sm text-alert">{loadError}</p>
          <button type="button" onClick={loadUsers} className="btn btn-line shrink-0">{t('retry')}</button>
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-ink-faint py-6">{t('noUsersFoundLabel')}</p>
      ) : (
        <>
          <div className="admin-user-table-head">
            <span>{t('colName')}</span>
            <span>{t('colRole')}</span>
            <span>{t('colRegion')}</span>
            <span>{t('colStatus')}</span>
            <span className="text-right">{t('colActions')}</span>
          </div>

          <div>
            {users.map((user) => {
              const role = (user.role || '').trim().toLowerCase();
              const RoleIcon = ROLE_ICONS[role] || Users;
              const isExpanded = expandedId === user.id;
              return (
                <div key={user.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : user.id)}
                    className="admin-user-row"
                    aria-expanded={isExpanded}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="index-icon shrink-0" style={{ width: '2.5rem', height: '2.5rem' }}><RoleIcon className="w-4 h-4" /></span>
                      <span className="font-display text-base font-medium truncate">{user.full_name || '—'}</span>
                    </span>
                    <span>
                      <StatusBadge tone={ROLE_BADGE_TONES[role] || 'muted'}>{t(ROLE_LABEL_KEYS[role] || 'modeCaregiverLabel')}</StatusBadge>
                    </span>
                    <span className="text-sm text-ink-faint truncate">{user.state || '—'}</span>
                    <span>
                      <StatusBadge tone={user.is_active === false ? 'alert' : 'jade'} dot>
                        {t(user.is_active === false ? 'statusInactiveLabel' : 'statusActiveLabel')}
                      </StatusBadge>
                    </span>
                    <span className="flex justify-end">
                      <ChevronDown className="index-arrow w-5 h-5 shrink-0" style={{ opacity: 1, transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                    </span>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <ExpandedUserDetail
                          user={user}
                          t={t}
                          refreshKey={detailRefreshKey}
                          onToggleActive={() => toggleUserActive(user)}
                          onRequestDisconnect={(conn) => setDisconnectTarget(conn)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-5" style={{ borderTop: '1px solid var(--hairline)' }}>
            <span className="text-xs text-ink-faint">
              {t('showingRangeLabel').replace('{from}', from).replace('{to}', to).replace('{total}', total)}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-icon" aria-label={t('prevPageLabel')}>
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>
              {buildPageList(currentPage, totalPages).map((p, idx) => (
                typeof p === 'number' ? (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p - 1)}
                    className="btn-icon"
                    style={p === currentPage ? { borderColor: 'var(--ember)', color: 'var(--ember)' } : {}}
                    aria-current={p === currentPage ? 'page' : undefined}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`ellipsis-${idx}`} className="text-ink-faint px-1">…</span>
                )
              ))}
              <button type="button" disabled={to >= total} onClick={() => setPage((p) => p + 1)} className="btn-icon" aria-label={t('nextPageLabel')}>
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={!!disconnectTarget}
        title={t('adminDisconnectConfirmTitle')}
        message={t('adminDisconnectConfirmMessage')}
        confirmLabel={t('disconnectLabel')}
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}

// Small, dependency-free page-number list: current +/-1, plus first/last,
// with an ellipsis for any gap — matches the reference's "1 2 3 … 9" shape
// without pulling in a pagination library for one component.
function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const withEllipsis = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withEllipsis.push('…');
    withEllipsis.push(p);
  });
  return withEllipsis;
}

function ExpandedUserDetail({ user, t, refreshKey, onToggleActive, onRequestDisconnect }) {
  const [counts, setCounts] = useState(null);
  const [connections, setConnections] = useState(null);
  const [location, setLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const role = (user.role || '').trim().toLowerCase();
  const isElder = role === 'elderly';

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      AdminService.getUserActivityCounts(user.id),
      AdminService.getUserConnections(user.id),
      isElder ? LocationService.getLatestLocation(user.id) : Promise.resolve({ ok: true, location: null })
    ]).then(([countsRes, connRes, locationRes]) => {
      if (cancelled) return;
      setCounts(countsRes.ok ? countsRes : null);
      setConnections(connRes.ok ? connRes : null);
      setLocation(locationRes.ok ? locationRes.location : null);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user.id, isElder, refreshKey]);

  const relevantConnections = role === 'elderly' ? connections?.asElder : role === 'caregiver' ? connections?.asCaregiver : [];
  const relationshipLabelKey = role === 'elderly' ? 'relationshipsAsElderLabel' : 'relationshipsAsCaregiverLabel';
  const locationStatus = LocationService.getLocationStatus(location);

  return (
    <div className="well p-5 mb-2 space-y-5">
      {isLoading ? (
        <SkeletonList rows={2} label={t('adminLoadingLabel')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-8">
            <div className="figure">
              <span className="figure-label">{t('reminderCountLabel')}</span>
              <span className="figure-value" style={{ fontSize: '1.4rem' }}>{counts?.reminderCount ?? 0}</span>
            </div>
            <div className="figure">
              <span className="figure-label">{t('memoryCountLabel')}</span>
              <span className="figure-value" style={{ fontSize: '1.4rem' }}>{counts?.memoryCount ?? 0}</span>
            </div>
            <div className="figure">
              <span className="figure-label">{t('joinedLabel')}</span>
              <span className="text-sm font-medium block mt-1">{formatDateTime(user.created_at)}</span>
            </div>
            {user.role === 'elderly' && user.connection_code && (
              <div className="figure">
                <span className="figure-label">{t('connectionCodeFieldLabel')}</span>
                <span className="font-mono text-sm font-semibold block mt-1">{user.connection_code}</span>
              </div>
            )}
            <button type="button" onClick={onToggleActive} className="btn btn-line shrink-0 ml-auto">
              {user.is_active === false ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
              {t(user.is_active === false ? 'activateUserLabel' : 'deactivateUserLabel')}
            </button>
          </div>

          {role !== 'admin' && (
            <div>
              <span className="figure-label flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> {t(relationshipLabelKey)}</span>
              {!relevantConnections || relevantConnections.length === 0 ? (
                <p className="text-sm mt-2 text-ink-faint">{t('noConnectionsLabel')}</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {relevantConnections.map((conn) => (
                    <div key={conn.id} className="flex items-center justify-between gap-4 text-sm py-2 border-t border-hairline">
                      <span className="min-w-0 truncate">
                        {conn.other?.full_name || '—'}{' '}
                        <StatusBadge tone={conn.status === 'accepted' ? 'jade' : conn.status === 'rejected' ? 'alert' : 'ember'} dot>
                          {t(CONNECTION_STATUS_KEYS[conn.status] || 'pendingApprovalNotice')}
                        </StatusBadge>
                      </span>
                      {conn.status === 'accepted' && (
                        <button type="button" onClick={() => onRequestDisconnect(conn)} className="btn btn-danger-quiet shrink-0">
                          {t('disconnectLabel')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isElder && (
            <div>
              <span className="figure-label flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {t('elderLocationTitle')}</span>
              {!location ? (
                <p className="text-sm mt-2 text-ink-faint">{t('noLocationSharedYetDesc')}</p>
              ) : (
                <div className="mt-2 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <StatusBadge tone={LOCATION_STATUS_TONES[locationStatus]} dot pulse={locationStatus === 'live'}>
                      {t(LOCATION_STATUS_KEYS[locationStatus])}
                    </StatusBadge>
                    <span className="flex items-center gap-1.5 text-ink-faint"><Clock className="w-3.5 h-3.5" /> {t('lastUpdatedLabel')}: {formatDateTime(location.recorded_at)}</span>
                    {typeof location.accuracy === 'number' && (
                      <span className="flex items-center gap-1.5 text-ink-faint"><Navigation className="w-3.5 h-3.5" /> {t('accuracyLabel')}: {t('accuracyMetersValue').replace('{meters}', Math.round(location.accuracy))}</span>
                    )}
                  </div>
                  <LocationMap
                    latitude={location.latitude}
                    longitude={location.longitude}
                    accuracy={location.accuracy}
                    label={user.full_name}
                    recenterLabel={t('recenterMapLabel')}
                    openInMapsLabel={t('openInMapsLabel')}
                    height="12rem"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
