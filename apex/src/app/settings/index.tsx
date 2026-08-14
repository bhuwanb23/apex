import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StackHeader } from '@/components/stack-header';
import { AppIcon, type IconName } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ROLES, useOnboarding } from '@/context/onboarding';

export default function SettingsScreen() {
  const router = useRouter();
  const { role, setDefaultModule, defaultModule, storyLanguage, setStoryLanguage } = useOnboarding();
  const [cleared, setCleared] = useState(false);

  const roleLabel = ROLES.find(r => r.id === role)?.label ?? 'Analyst';

  const clearCache = () => {
    setCleared(true);
    setTimeout(() => setCleared(false), 1500);
  };

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
          value="2 sports active"
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
        <SettingRow icon="clock.fill" label="Last data sync" value="2 hours ago" />
        <SettingRow icon="refresh" label="Refresh data now" value="Tap to sync" onPress={() => {}} />
        <SettingRow icon="calendar" label="Cache status" value={cleared ? 'Cleared ✓' : '1,284 entries'} />
        <Pressable onPress={clearCache}>
          <SettingRow icon="xmark" label="Clear cache" value={cleared ? 'Done' : 'Tap to clear'} danger />
        </Pressable>
      </Section>

      {/* App */}
      <Section title="App">
        <SettingRow icon="doc.fill" label="Version" value="1.0.0" />
        <SettingRow icon="location.fill" label="Backend URL" value="localhost:8000" />
        <SettingRow icon="info.circle.fill" label="System health" value={<HealthDot />} />
      </Section>

      <Section title="About">
        <Text style={styles.about}>
          AQX Sports Intelligence — injury risk, coaching decisions, and momentum analytics for NBA, NFL, MLB, and NHL.
        </Text>
      </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
  value?: React.ReactNode;
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

function SettingBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={[styles.row, styles.blockRow]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function HealthDot() {
  return (
    <View style={styles.healthWrap}>
      <View style={styles.healthDot} />
      <Text style={styles.healthText}>All services running</Text>
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
    backgroundColor: '#2FA36B',
  },
  healthText: {
    fontSize: 12.5,
    color: '#1F8A52',
    fontWeight: '600',
  },
  about: {
    fontSize: 12.5,
    color: '#6E7280',
    lineHeight: 19,
  },
});
