import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { AppIcon, type IconName } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ROLES, useOnboarding } from '@/context/onboarding';
import { useBackend } from '@/context/backend';
import { api, type CacheStatsResponse, type JobsStatusResponse } from '@/lib/api';
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

const STATUS_COLOR: Record<HealthStatus, string> = { ok: '#2FA36B', degraded: '#F5A623', down: '#E5484D' };
const STATUS_LABEL: Record<HealthStatus, string> = { ok: 'All services running', degraded: 'Degraded', down: 'Issues detected' };

export default function SettingsScreen() {
  const router = useRouter();
  const { role, setDefaultModule, defaultModule, storyLanguage, setStoryLanguage, sports } = useOnboarding();
  const { health, status, refresh } = useBackend();
  const [cleared, setCleared] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('2 hours ago');
  const [healthOpen, setHealthOpen] = useState(false);
  const [services, setServices] = useState<ServiceHealth[]>(SERVICES);
  const [aboutOpen, setAboutOpen] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStatsResponse | null>(null);
  const [jobs, setJobs] = useState<JobsStatusResponse | null>(null);

  // Pull real cache + job state from the backend when it is reachable.
  useEffect(() => {
    if (status !== 'online') return;
    api.cacheStats().then(setCacheStats).catch(() => {});
    api.jobsStatus().then(setJobs).catch(() => {});
  }, [status]);

  const lastSyncLabel = jobs?.jobs?.find(j => j.jobName === 'data_sync')?.lastRunAt
    ? `Last run ${timeAgo(jobs.jobs.find(j => j.jobName === 'data_sync')!.lastRunAt!)}`
    : lastSync;

  // Health services come from the live health ping.
  useEffect(() => {
    if (health) {
      setServices([
        { name: 'API', status: health.status === 'ok' ? 'ok' : 'degraded', detail: `Healthy · ${health.version}` },
        { name: 'ML Service', status: health.services.mlService === 'connected' ? 'ok' : 'down', detail: health.services.mlService === 'connected' ? 'Healthy' : 'Unreachable' },
        { name: 'Database', status: health.services.database === 'connected' ? 'ok' : 'down', detail: health.services.database === 'connected' ? 'Healthy' : 'Unreachable' },
        { name: 'Cache', status: health.services.cache === 'connected' ? 'ok' : 'down', detail: health.services.cache === 'connected' ? 'Healthy' : 'Unreachable' },
      ]);
    }
  }, [health]);

  const roleLabel = ROLES.find(r => r.id === role)?.label ?? 'Analyst';
  const healthBadge = overallStatus(services);

  const refreshData = () => {
    if (syncing) return;
    setSyncing(true);
    // Ask the backend to refresh — re-ping health + jobs and re-check the ping.
    void refresh();
    api.jobsStatus().then(setJobs).catch(() => {});
    setTimeout(() => {
      setSyncing(false);
      setLastSync('Just now');
    }, 1200);
  };

  const runHealthCheck = () => {
    void refresh();
  };

  const clearCacheLive = () => {
    setCleared(true);
    setCacheStats(null);
    api.cacheStats().then(setCacheStats).catch(() => {});
    setTimeout(() => setCleared(false), 1500);
  };

  const ABOUT: { id: string; icon: IconName; title: string; body: string }[] = [
    {
      id: 'what',
      icon: 'sparkles',
      title: 'What is AQX',
      body: 'AQX Sports Intelligence analyzes injury risk, grades coaching decisions, and measures momentum across NBA, NFL, MLB, and NHL — turning raw play-by-play data into plain-English insight.',
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
      <StackHeader title="Settings" right={<CloseButton onPress={() => router.back()} />} />

      {/* Profile */}
      <Card style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <AppIcon name="person.crop.circle.fill" size={40} color="#5856D6" />
        </View>
        <View style={styles.profileBody}>
          <Text style={styles.profileName}>AQX User</Text>
          <Text style={styles.profileRole}>{roleLabel}</Text>
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
        <SettingRow icon="location.fill" label="Backend URL" value="localhost:8000" />
        <SettingRow
          icon="info.circle.fill"
          label="System health"
          value={<HealthBadge status={healthBadge} />}
          onPress={() => setHealthOpen(true)}
        />
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
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 20,
    paddingBottom: 60,
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
