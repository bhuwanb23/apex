import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AqxLogo } from '@/components/aqx-logo';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat';
import { SectionHeader } from '@/components/ui/section-header';
import { VerdictBadge, QualityBadge } from '@/components/ui/badge';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { GradientView } from '@/components/ui/gradient';
import { useOnboarding } from '@/context/onboarding';
import { SPORT_BY_ID } from '@/data/mock/sports';
import { useHomeData } from '@/data/live/home';

function relativeNightLabel(nightsAgo: number): string {
  if (nightsAgo <= 1) return 'Last night';
  return `${nightsAgo} nights ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { role, cycleActiveSport } = useOnboarding();
  const { sport, injury, decision, momentum, games } = useHomeData();
  const sportInfo = SPORT_BY_ID[sport];

  const redZone = injury.players;
  const { decision: bestDecision, coach: bestCoach } = decision;
  const verdict = momentum.verdict;
  const recentGames = games.games;
  const anyDemo = injury.source === 'demo' || decision.source === 'demo' || momentum.source === 'demo' || games.source === 'demo';

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const roleLabel =
    role === 'trainer'
      ? 'Trainer'
      : role === 'coach'
        ? 'Coach'
        : role === 'analyst'
          ? 'Analyst'
          : 'Fan';

  return (
    <Screen>
      {/* Top bar */}
      <View style={styles.topBar}>
        <AqxLogo size={38} />
        <View style={styles.topActions}>
          <Pressable onPress={cycleActiveSport} style={styles.sportBadgeWrap} accessibilityLabel={`Active sport: ${sportInfo.short}. Tap to change`}>
            <GradientView colors={sportInfo.gradient} style={styles.sportBadge}>
              <Text style={styles.sportBadgeText}>{sportInfo.short}</Text>
              <AppIcon name="chevron.down" size={11} color="#FFFFFF" />
            </GradientView>
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => router.push('/search')}>
            <AppIcon name="magnifyingglass" size={20} color="#14121F" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => router.push('/settings')}>
            <AppIcon name="gearshape.fill" size={20} color="#14121F" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => router.push('/injury/alerts')}>
            <AppIcon name="bell.fill" size={20} color="#14121F" />
            <View style={styles.bellDot} />
          </Pressable>
        </View>
      </View>

      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingTitle}>
          {greeting}, {roleLabel}
        </Text>
        <Text style={styles.greetingSub}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
          {sportInfo.short} 2025-26 season
        </Text>
      </View>

      {/* Quick stats */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
        <StatTile icon="flame.fill" value={`${redZone.length}`} label="Red zone players this week" accent="#E5484D" />
        <StatTile icon="flag.checkered" value="4th & 2" label="Riskiest call today · Go for it" accent="#5856D6" />
        <StatTile icon="bolt.fill" value={verdict.verdict === 'real' ? 'Real' : verdict.verdict === 'myth' ? 'Myth' : 'TBD'} label={`Momentum verdict · ${sportInfo.short}`} accent="#FFA058" />
        <StatTile icon="chart.bar.fill" value={`${momentum.verdict.gamesAnalyzed || 24}`} label="Games analyzed today" accent="#3C87F7" />
      </ScrollView>

      {/* Injury watch */}
      <View>
        <SectionHeader
          title="Injury Watch"
          emoji="⚠️"
          actionLabel="See all alerts"
          onAction={() => router.push('/injury/alerts')}
        />
        <View style={styles.sectionGap}>
          {redZone.map(player => (
            <Pressable
              key={player.id}
              onPress={() => router.push({ pathname: '/injury/player', params: { playerId: player.id } })}>
              <Card style={styles.alertRow}>
                <View style={styles.alertAvatar}>
                  <Text style={styles.alertAvatarText}>{player.lastName.slice(0, 1)}</Text>
                </View>
                <View style={styles.alertBody}>
                  <View style={styles.alertNameRow}>
                    <Text style={styles.alertName}>{player.name}</Text>
                    <Text style={styles.alertTeam}>{player.team}</Text>
                  </View>
                  <Text style={styles.alertTrigger}>{player.triggerMetric}</Text>
                </View>
                <View style={styles.alertScoreBadge}>
                  <Text style={styles.alertScoreText}>{player.riskScore}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Best decision spotlight */}
      <View>
        <SectionHeader title="Best Decision This Week" emoji="🧠" actionLabel="Leaderboard" onAction={() => router.push('/decisions')} />
        <Card style={styles.spotlight}>
          <View style={styles.spotlightTop}>
            <QualityBadge optimal={bestDecision.isOptimal} />
            <Text style={styles.spotlightCoach}>
              {bestCoach.name} · {bestCoach.team}
            </Text>
          </View>
          <Text style={styles.spotlightTitle}>
            {bestDecision.type === '4th_down' ? 'Go for it on 4th and 2' : bestDecision.chosenAction}
          </Text>
          <Text style={styles.spotlightDesc}>{bestDecision.situation}</Text>
          <Text style={styles.spotlightOutcome}>{bestDecision.outcome}</Text>
        </Card>
      </View>

      {/* Momentum check */}
      <View>
        <SectionHeader title="Momentum Check" emoji="⚡" actionLabel="Explore" onAction={() => router.push({ pathname: '/momentum', params: { sport } })} />
        <Card style={styles.momentumCard}>
          <VerdictBadge verdict={verdict.verdict} />
          <Text style={styles.momentumText}>{verdict.explanation}</Text>
        </Card>
      </View>

      {/* Last night's games */}
      <View>
        <SectionHeader title="Last Night's Games" emoji="🏀" actionLabel="Replays" onAction={() => router.push('/momentum')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gamesRow}>
          {recentGames.map(game => (
            <Pressable
              key={game.id}
              onPress={() => router.push({ pathname: '/momentum/replay', params: { gameId: game.id } })}>
              <Card style={styles.gameCard}>
                <View style={styles.gameHeader}>
                  <Text style={styles.gameDate}>{relativeNightLabel(game.nightsAgo)}</Text>
                  <View style={styles.gameSportTag}>
                    <Text style={styles.gameSportTagText}>{game.sport}</Text>
                  </View>
                </View>
                <View style={styles.gameLine}>
                  <Text style={styles.gameTeam}>{game.homeTeam}</Text>
                  <Text style={styles.gameScore}>{game.homeScore}</Text>
                </View>
                <View style={styles.gameLine}>
                  <Text style={styles.gameTeam}>{game.awayTeam}</Text>
                  <Text style={styles.gameScore}>{game.awayScore}</Text>
                </View>
                <View style={styles.gameMeta}>
                  <AppIcon name="bolt.fill" size={12} color="#FFA058" />
                  <Text style={styles.gameMetaText}>{game.momentumShifts} momentum shifts</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {anyDemo ? (
        <View style={styles.demoRow}>
          <Text style={styles.demoNote}>Some sections are showing demo data — the backend has no live data for this sport yet.</Text>
        </View>
      ) : null}

      {/* Story mode */}
      <PillButton
        label="📖 Tell me what's happening today"
        variant="primary"
        size="lg"
        onPress={() => router.push({ pathname: '/story', params: { module: 'home', sport } })}
        icon={<AppIcon name="sparkles" size={18} color="#FFFFFF" />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportBadgeWrap: {
    marginRight: 6,
  },
  sportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 34,
  },
  sportBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5484D',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  greeting: {
    gap: 4,
    marginTop: 4,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#14121F',
  },
  greetingSub: {
    fontSize: 13,
    color: '#6E7280',
  },
  statsRow: {
    gap: 10,
    paddingRight: 8,
  },
  sectionGap: {
    gap: 10,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  alertAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FDEBEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E5484D',
  },
  alertBody: {
    flex: 1,
    gap: 2,
  },
  alertNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  alertTeam: {
    fontSize: 12,
    color: '#6E7280',
  },
  alertTrigger: {
    fontSize: 12,
    color: '#E5484D',
    fontWeight: '600',
  },
  alertScoreBadge: {
    minWidth: 44,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FDEBEC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  alertScoreText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E5484D',
  },
  spotlight: {
    gap: 8,
  },
  spotlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spotlightCoach: {
    fontSize: 12,
    color: '#6E7280',
    fontWeight: '600',
  },
  spotlightTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14121F',
  },
  spotlightDesc: {
    fontSize: 13,
    color: '#6E7280',
    lineHeight: 19,
  },
  spotlightOutcome: {
    fontSize: 13,
    color: '#1F8A52',
    lineHeight: 19,
    fontWeight: '500',
  },
  momentumCard: {
    gap: 10,
  },
  momentumText: {
    fontSize: 13.5,
    color: '#6E7280',
    lineHeight: 20,
  },
  gamesRow: {
    gap: 12,
    paddingRight: 8,
  },
  gameCard: {
    width: 200,
    gap: 6,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameDate: {
    fontSize: 12,
    color: '#6E7280',
    fontWeight: '600',
  },
  gameSportTag: {
    backgroundColor: '#EFEEFB',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  gameSportTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5856D6',
  },
  gameLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameTeam: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14121F',
  },
  gameScore: {
    fontSize: 15,
    fontWeight: '800',
    color: '#14121F',
  },
  gameMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  gameMetaText: {
    fontSize: 11.5,
    color: '#6E7280',
  },
  demoRow: {
    backgroundColor: '#FFF4DF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  demoNote: {
    fontSize: 11.5,
    color: '#8A6116',
    lineHeight: 16,
    textAlign: 'center',
  },
});
