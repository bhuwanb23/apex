import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { AppIcon, type IconName } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ROLES, useOnboarding } from '@/context/onboarding';
import { useAuth } from '@/context/auth';
import { useBackend } from '@/context/backend';
import { api, getApiBaseUrl, setApiBaseUrl, resetApiBaseUrl, type CacheStatsResponse, type JobsStatusResponse } from '@/lib/api';
import { clearDeviceCache } from '@/lib/storage';
import { timeAgo } from '@/lib/time';

type HealthStatus = 'ok' | 'degraded' | 'down';

interface ServiceHealth {
  name: string;
  status: HealthStatus;
  detail: string;
}

const SERVICES: ServiceHealth[] = [
  { name: 'API', status: 'ok', detail: 'Healthy · 42ms' },
  { name: 'ML Service', status: 'ok', detail: 'Healthy · 87ms' },
  { name: 'Database', status: 'ok', detail: 'Healthy · 12ms' },
  { name: 'Background jobs', status: 'ok', detail: 'Running · 0 queued' },
];

/** Worst status across services drives the dot (green/yellow/red). */
function overallStatus(services: ServiceHealth[]): HealthStatus {
  if (services.some(s => s.status === 'down')) return 'down';
  if (services.some(s => s.status === 'degraded')) return 'degraded';
  return 'ok';
}

/** Live service list derived from the health ping (no effect needed). */
function servicesFromHealth(health: { status: string; version: string; services: { mlService: string; database: string; cache: string } }): ServiceHealth[] {
  return [
    { name: 'API', status: health.status === 'ok' ? 'ok' : 'degraded', detail: `Healthy · ${health.version}` },
    { name: 'ML Service', status: health.services.mlService === 'connected' ? 'ok' : 'down', detail: health.services.mlService === 'connected' ? 'Healthy' : 'Unreachable' },
    { name: 'Database', status: health.services.database === 'connected' ? 'ok' : 'down', detail: health.services.database === 'connected' ? 'Healthy' : 'Unreachable' },
    { name: 'Cache', status: health.services.cache === 'connected' ? 'ok' : 'down', detail: health.services.cache === 'connected' ? 'Healthy' : 'Unreachable' },
  ];
}

const STATUS_COLOR: Record<HealthStatus, string> = { ok: '#2FA36B', degraded: '#F5A623', down: '#E5484D' };
const STATUS_LABEL: Record<HealthStatus, string> = { ok: 'All services running', degraded: 'Degraded', down: 'Issues detected' };

export default function SettingsScreen() {
  const router = useRouter();
  const { role, setDefaultModule, defaultModule, storyLanguage, setStoryLanguage, sports, activeSport, resetOnboarding } = useOnboarding();
  const { user, logout } = useAuth();
  const { health, status, refresh } = useBackend();
  const [cleared, setCleared] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync] = useState('2 hours ago');
  const [healthOpen, setHealthOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStatsResponse | null>(null);
  const [jobs, setJobs] = useState<JobsStatusResponse | null>(null);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [urlSaved, setUrlSaved] = useState(false);

  // Live service health derived from the ping (no effect/state — fix #lint).
  const services = health ? servicesFromHealth(health) : SERVICES;

  // Pull real cache + job state from the backend when it is reachable.
  useEffect(() => {
    if (status !== 'online') return;
    api.cacheStats().then(setCacheStats).catch(() => {});
    api.jobsStatus().then(setJobs).catch(() => {});
  }, [status]);

  const lastSyncLabel = jobs?.jobs?.find(j => j.jobName === 'data_sync')?.lastRunAt
    ? `Last run ${timeAgo(jobs.jobs.find(j => j.jobName === 'data_sync')!.lastRunAt!)}`
    : lastSync;

  const roleLabel = ROLES.find(r => r.id === role)?.label ?? 'Analyst';
  const healthBadge = overallStatus(services);

  /**
   * "Refresh data now" — the plan's flow: trigger a real backend sync
   * (optionally for the active sport), get its job id, then poll the backend
   * every 5 seconds until the run finishes. On completion, refresh the
   * screen's health / job / cache state (screens refetch when their deps
   * change, so the data they show is fresh again).
   */
  const refreshData = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const trigger = await api.syncRefresh(activeSport);
      const logId = trigger.logId;
      const triggeredAt = Date.now();

      // Poll every 5s — "is job <id> complete?" (give up after 2 minutes).
      const deadline = triggeredAt + 120_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000));
        const { runs } = await api.jobsHistory('data_sync', 1);
        const run = runs[0];
        if (!run) continue;
        // Ours = matching log id, or (when the id is null — e.g. a run was
        // skipped as already in-flight) any run started after we triggered.
        const isOurs =
          logId != null ? run.id === logId : new Date(run.startedAt).getTime() >= triggeredAt;
        if (isOurs && run.status !== 'running') break; // completed / partial / failed
      }

      // Run finished (or timed out) — refresh what this screen shows.
      void refresh();
      const [j, c] = await Promise.all([api.jobsStatus(), api.cacheStats()]);
      setJobs(j);
      setCacheStats(c);
    } catch {
      // Backend unreachable — re-ping health only, keep the demo behavior.
      void refresh();
      api.jobsStatus().then(setJobs).catch(() => {});
    } finally {
      setSyncing(false);
    }
  };

  const runHealthCheck = () => {
    void refresh();
  };

  /** Real "Clear cache": flush backend entries (memory + SQLite registry) via
   *  the admin endpoint, clear this device's cached API payloads, then re-pull
   *  the stats so the count reflects the cleared state. Previously a no-op. */
  const clearCacheLive = async () => {
    setCleared(true);
    setCacheStats(null);
    try {
      await api.cacheInvalidate({ all: true });
    } catch {
      // Backend unreachable or key rejected — still clear the device cache.
    }
    await clearDeviceCache();
    api.cacheStats().then(setCacheStats).catch(() => {});
    setTimeout(() => setCleared(false), 1500);
  };

  /**
   * "Backend URL" — switch between local and deployed backends without a
   * rebuild. Persists on the device; the very next request uses the new URL.
   * The health re-ping confirms the new address is reachable.
   */
  const saveApiUrl = async () => {
    await setApiUrl(apiUrl);
    setUrlSaved(true);
    void refresh();
    setTimeout(() => setUrlSaved(false), 1500);
  };

  const restoreApiUrl = async () => {
    await resetApiBaseUrl();
    setApiUrl(getApiBaseUrl());
    setUrlSaved(true);
    void refresh();
    setTimeout(() => setUrlSaved(false), 1500);
  };

  /** Mock auth logout — clears the session; the root layout swaps to login. */
  const signOut = () => {
    void logout();
    router.dismissAll?.();
  };

  /** Re-show the setup flow (preferences are kept — user re-picks sport/role). */
  const reRunSetup = () => {
    resetOnboarding();
    router.dismissAll?.();
  };

  const ABOUT: { id: string; icon: IconName; title: string; body: string }[] = [
    {
      id: 'what',
      icon: 'sparkles',
      title: 'What is Apex',
      body: 'Apex Sports Intelligence analyzes injury risk, grades coaching decisions, and measures momentum across NBA, NFL, MLB, and NHL — turning raw play-by-play data into plain-English insight.',
    },
    {
      id: 'sources',
      icon: 'book.fill',
      title: 'Data sources',
      body: 'Player workload and injury flags come from league statistics (points, minutes, back-to-backs). Decision quality uses expected-value models for 4th downs, timeouts, and 2-point conversions. Momentum uses a Cox hazard model on scoring runs.',
    },
    {
      id: 'method',
      icon: 'chart.line.uptrend.xyaxis',
      title: 'Methodology',
      body: 'Risk scores are z-score deviations from each player\u2019s 5-game baseline. Coach ratings measure how often the chosen option matched the highest-EV alternative. Momentum verdicts use hazard ratios with 95% confidence intervals.',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <StackHeader title="Settings" right={<CloseButton onPress={() => router.back()} />} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Profile — signed-in account from mock auth + role */}
      <Card style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <AppIcon name="person.crop.circle.fill" size={40} color="#5856D6" />
        </View>
        <View style={styles.profileBody}>
          <Text style={styles.profileName}>{user?.name ?? 'Apex User'}</Text>
          <Text style={styles.profileRole}>{user?.email ?? roleLabel}</Text>
        </View>
        <Pressable style={styles.changeBtn} onPress={() => router.push('/settings/role-preferences')}>
          <Text style={styles.changeText}>Change role</Text>
        </Pressable>
      </Card>

      {/* Preferences */}
      <Section title="Preferences">
        <SettingRow
          icon="calendar"
          label="Sport preferences"
          value={`${sports.length} ${sports.length === 1 ? 'sport' : 'sports'} active`}
          onPress={() => router.push('/settings/sport-preferences')}
        />
        <SettingBlock label="Default module">
          <View style={styles.segment}>
            {(['home', 'injury', 'decisions', 'momentum'] as const).map(m => (
              <Pressable
                key={m}
                style={[styles.segmentBtn, defaultModule === m && styles.segmentActive]}
                onPress={() => setDefaultModule(m)}>
                <Text style={[styles.segmentText, defaultModule === m && styles.segmentTextActive]}>
                  {m[0].toUpperCase() + m.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </SettingBlock>
        <SettingBlock label="Story mode language">
          <View style={styles.chipRow}>
            <Chip label="Simple" small selected={storyLanguage === 'simple'} onPress={() => setStoryLanguage('simple')} />
            <Chip label="Technical" small selected={storyLanguage === 'technical'} onPress={() => setStoryLanguage('technical')} />
          </View>
        </SettingBlock>
      </Section>

      {/* Data */}
      <Section title="Data">
        <SettingRow icon="clock.fill" label="Last data sync" value={syncing ? 'Syncing…' : lastSyncLabel} />
        <SettingRow icon="refresh" label="Refresh data now" value={syncing ? 'Working…' : 'Tap to sync'} onPress={refreshData} />
        <SettingRow
          icon="calendar"
          label="Cache status"
          value={cleared ? 'Cleared ✓' : cacheStats ? `${cacheStats.memory.keys} memory · ${cacheStats.sqlite.totalEntries} sqlite` : 'Checking…'}
        />
        <Pressable onPress={clearCacheLive}>
          <SettingRow icon="xmark" label="Clear cache" value={cleared ? 'Done' : 'Tap to clear'} danger />
        </Pressable>
      </Section>

      {/* App */}
      <Section title="App">
        <SettingRow icon="doc.fill" label="Version" value={health?.version ?? Constants.expoConfig?.version ?? '1.0.0'} />
        <SettingBlock label="Backend URL">
          <TextInput
            style={styles.urlInput}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://192.168.1.50:8000"
            placeholderTextColor="#9AA0B5"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={styles.urlActions}>
            <Pressable style={[styles.urlBtn, styles.urlBtnPrimary]} onPress={saveApiUrl}>
              <Text style={styles.urlBtnPrimaryText}>{urlSaved ? 'Saved ✓' : 'Save'}</Text>
            </Pressable>
            <Pressable style={styles.urlBtn} onPress={restoreApiUrl}>
              <Text style={styles.urlBtnText}>Reset</Text>
            </Pressable>
          </View>
        </SettingBlock>
        <SettingRow
          icon="info.circle.fill"
          label="System health"
          value={<HealthBadge status={healthBadge} />}
          onPress={() => setHealthOpen(true)}
        />
        <SettingRow icon="calendar" label="Re-run setup" value="Onboarding again" onPress={reRunSetup} />
        <SettingRow icon="person.crop.circle.fill" label="Signed in" value={user?.email ?? '—'} />
        <Pressable onPress={signOut}>
          <SettingRow icon="xmark" label="Log out" value="End session" danger />
        </Pressable>
      </Section>

      {/* About */}
      <Section title="About">
        {ABOUT.map(item => (
          <Pressable key={item.id} onPress={() => setAboutOpen(prev => (prev === item.id ? null : item.id))}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <AppIcon name={item.icon} size={16} color="#5856D6" />
              </View>
              <Text style={styles.rowLabel}>{item.title}</Text>
              <AppIcon name={aboutOpen === item.id ? 'chevron.down' : 'chevron.right'} size={14} color="#C6C8D2" />
            </View>
            {aboutOpen === item.id ? (
              <Text style={styles.aboutBody}>{item.body}</Text>
            ) : null}
          </Pressable>
        ))}
      </Section>
      </ScrollView>

      {/* Health detail modal */}
      <Modal visible={healthOpen} transparent animationType="fade" onRequestClose={() => setHealthOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setHealthOpen(false)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>System health</Text>
                <HealthBadge status={healthBadge} />
              </View>
              <Pressable onPress={() => setHealthOpen(false)} hitSlop={10}>
                <AppIcon name="xmark" size={18} color="#6E7280" />
              </Pressable>
            </View>
            <View style={styles.serviceList}>
              {services.map(s => (
                <View key={s.name} style={styles.serviceRow}>
                  <View style={[styles.serviceDot, { backgroundColor: STATUS_COLOR[s.status] }]} />
                  <View style={styles.serviceBody}>
                    <Text style={styles.serviceName}>{s.name}</Text>
                    <Text style={styles.serviceDetail}>{s.detail}</Text>
                  </View>
                  <Text style={[styles.serviceStatus, { color: STATUS_COLOR[s.status] }]}>{STATUS_LABEL[s.status]}</Text>
                </View>
              ))}
            </View>
            <Pressable style={styles.checkBtn} onPress={runHealthCheck}>
              <AppIcon name="refresh" size={15} color="#FFFFFF" />
              <Text style={styles.checkText}>Run health check</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.closeBtn}>
      <AppIcon name="xmark" size={16} color="#14121F" />
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={styles.sectionCard} padded={false}>
        {children}
      </Card>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger = false,
}: {
  icon: IconName;
  label: string;
  value?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <AppIcon name={icon} size={16} color={danger ? '#E5484D' : '#5856D6'} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: '#E5484D' }]}>{label}</Text>
      {typeof value === 'string' ? <Text style={styles.rowValue}>{value}</Text> : value}
      {onPress ? <AppIcon name="chevron.right" size={14} color="#C6C8D2" /> : null}
    </Pressable>
  );
}

function SettingBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={[styles.row, styles.blockRow]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function HealthBadge({ status }: { status: HealthStatus }) {
  return (
    <View style={styles.healthWrap}>
      <View style={[styles.healthDot, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={[styles.healthText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
  },
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 20,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 60,
    gap: 20,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFEEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBody: {
    flex: 1,
    gap: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#14121F',
  },
  profileRole: {
    fontSize: 13,
    color: '#6E7280',
  },
  changeBtn: {
    backgroundColor: '#EFEEFB',
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5856D6',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6E7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 52,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EFEEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: '#FDEBEC',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#14121F',
  },
  rowValue: {
    fontSize: 13,
    color: '#6E7280',
    fontWeight: '500',
  },
  blockRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#F0F1F5',
    borderRadius: 12,
    padding: 3,
    gap: 2,
    alignSelf: 'stretch',
  },
  segmentBtn: {
    flex: 1,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E7280',
  },
  segmentTextActive: {
    color: '#14121F',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  urlInput: {
    alignSelf: 'stretch',
    backgroundColor: '#F0F1F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13.5,
    color: '#14121F',
  },
  urlActions: {
    flexDirection: 'row',
    gap: 8,
  },
  urlBtn: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#EFEEFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlBtnPrimary: {
    backgroundColor: '#5856D6',
  },
  urlBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5856D6',
  },
  urlBtnPrimaryText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  healthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  healthText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  aboutBody: {
    fontSize: 12.5,
    color: '#6E7280',
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,18,31,0.45)',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14121F',
  },
  serviceList: {
    gap: 4,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F5',
  },
  serviceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  serviceBody: {
    flex: 1,
    gap: 1,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14121F',
  },
  serviceDetail: {
    fontSize: 11.5,
    color: '#9AA0B5',
  },
  serviceStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5856D6',
    borderRadius: 14,
    height: 46,
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
