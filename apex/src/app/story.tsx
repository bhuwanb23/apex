import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { AqxOrb } from '@/components/aqx-logo';
import { AppIcon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { MOMENTUM_VERDICTS } from '@/data/mock/sports';
import { PLAYERS } from '@/data/mock/players';
import { COACHES } from '@/data/mock/coaches';
import { useOnboarding, type RoleId } from '@/context/onboarding';

type DetailRoute =
  | { pathname: '/injury/player'; params: { playerId: string } }
  | { pathname: '/injury/alerts'; params: { sport: string } }
  | { pathname: '/decisions/coach'; params: { coachId: string } }
  | { pathname: '/momentum'; params: { sport: string } }
  | { pathname: '/injury' };

interface Story {
  headline: string;
  paragraph: string;
  metrics: string[];
  /** Route to push when the user taps "Read more" — null hides the button. */
  detailRoute?: DetailRoute;
}

function buildStory(module: string, sport: string, storyLanguage: 'simple' | 'technical', role: RoleId): Story {
  const red = PLAYERS.filter(p => p.sport === sport && p.zone === 'red');
  const verdict = MOMENTUM_VERDICTS.find(v => v.sport === sport);
  const deep = storyLanguage === 'technical' || role === 'analyst';

  if (module === 'injury') {
    const top = red[0];
    const headline = top
      ? `${top.name} is at high injury risk this week`
      : `No ${sport} players are in the red zone right now`;
    const paragraph = top
      ? `${top.name} (${top.team}) is flagged at a ${top.riskScore}/100 risk score after ${top.triggerMetric.toLowerCase().replace('↑ ', '')} spiked over the last week. ${top.explanation} Trainers may want to manage ${top.firstName}'s workload and watch for fatigue in the next back-to-back.`
      : `Workload across the ${sport} league is within normal ranges. ${red.length} players are in the elevated zone — a step away from red.`;
    const metrics = top
      ? [`${top.riskScore}/100 risk score`, top.triggerMetric, `${top.daysInZone}d in red zone`]
      : ['0 red zone players', 'All metrics normal'];
    return {
      headline,
      paragraph,
      metrics,
      detailRoute: top
        ? { pathname: '/injury/player', params: { playerId: top.id } }
        : { pathname: '/injury/alerts', params: { sport } },
    };
  }

  if (module === 'decisions') {
    const best = COACHES.find(c => c.sport === sport) ?? COACHES[0];
    const headline = `${best.name} leads ${sport} coaches on decision quality`;
    const paragraph = `${best.name} of the ${best.team} has made the statistically optimal call ${best.evRate}% of the time this season — ${best.optimalDecisions} of ${best.totalDecisions} decisions. On average he leaves just ${best.avgEvLeft}% of expected value on the table, the lowest among all ${sport} coaches.`;
    return {
      headline,
      paragraph,
      metrics: [`${best.evRate}% EV rate`, `${best.optimalDecisions} optimal calls`, `#${best.rank} ranked`],
      detailRoute: { pathname: '/decisions/coach', params: { coachId: best.id } },
    };
  }

  if (module === 'momentum') {
    const v = verdict ?? MOMENTUM_VERDICTS[1];
    const headline =
      v.verdict === 'real'
        ? `Momentum is real in ${sport} — here's the proof`
        : v.verdict === 'myth'
          ? `In ${sport}, momentum is a myth`
          : `Momentum in ${sport} is still unproven`;
    const paragraph = `${v.explanation} This verdict comes from analyzing ${v.gamesAnalyzed.toLocaleString()} ${v.sport} games from the ${v.season} season with a Cox proportional hazard model${
      deep ? ` (hazard coefficient ${v.hazardCoefficient.toFixed(2)}, p = ${v.pValue < 0.001 ? '< 0.001' : v.pValue.toFixed(3)})` : ''
    }.`;
    return {
      headline,
      paragraph,
      metrics: [`p = ${v.pValue < 0.001 ? '< 0.001' : v.pValue.toFixed(3)}`, `${v.gamesAnalyzed.toLocaleString()} games`, `${v.effectSize.toFixed(2)} effect size`],
      detailRoute: { pathname: '/momentum', params: { sport } },
    };
  }

  // home / default
  const top = red[0];
  const headline = top ? `${top.name} tops today's injury watch` : 'A quiet day across the league';
  const paragraph = `Good ${new Date().getHours() < 12 ? 'morning' : 'evening'} — here's the day in ${sport}. ${top ? `${top.name} is the highest-risk player at ${top.riskScore}/100, driven by ${top.triggerMetric.toLowerCase().replace('↑ ', '')}. ` : 'No players entered the red zone overnight. '}${COACHES.find(c => c.sport === sport)?.name ?? COACHES[0].name} keeps the best decision record in the league, and momentum analysis says ${verdict?.verdict === 'real' ? `it's real in ${sport}` : `${sport} shows no momentum effect`}.`;
  return {
    headline,
    paragraph,
    metrics: top ? [`${top.riskScore}/100 risk`, `${COACHES.find(c => c.sport === sport)?.evRate ?? COACHES[0].evRate}% EV rate`] : ['No new alerts', `${COACHES.find(c => c.sport === sport)?.evRate ?? COACHES[0].evRate}% EV rate`],
    detailRoute: top ? { pathname: '/injury/player', params: { playerId: top.id } } : { pathname: '/injury' },
  };
}

export default function StoryModal() {
  const router = useRouter();
  const { module, sport } = useLocalSearchParams<{ module?: string; sport?: string }>();
  const { storyLanguage, role } = useOnboarding();

  const story = buildStory(module ?? 'home', sport ?? 'NBA', storyLanguage, role ?? 'fan');

  const share = () => {
    Share.share({
      message: `${story.headline}\n\n${story.paragraph}`,
    }).catch(() => {});
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AqxOrb size={30} />
            <Text style={styles.headerTitle}>AQX Story Mode</Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn}>
            <AppIcon name="xmark" size={16} color="#14121F" />
          </Pressable>
        </View>

        <Text style={styles.headline}>{story.headline}</Text>
        <Text style={styles.paragraph}>{story.paragraph}</Text>

        <View style={styles.chips}>
          {story.metrics.map(m => (
            <View key={m} style={styles.chip}>
              <Text style={styles.chipText}>{m}</Text>
            </View>
          ))}
        </View>

        <Card style={styles.sourceCard}>
          <AppIcon name="clock.fill" size={13} color="#9AA0B5" />
          <Text style={styles.sourceText}>Generated from data updated 2 hours ago</Text>
        </Card>

        <View style={styles.actions}>
          <Pressable style={[styles.actionBtn, styles.actionSecondary]} onPress={share}>
            <AppIcon name="square.and.arrow.up" size={16} color="#5856D6" />
            <Text style={styles.actionSecondaryText}>Share story</Text>
          </Pressable>
          {story.detailRoute ? (
            <Pressable
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => {
                router.back();
                setTimeout(() => {
                  router.push(story.detailRoute!);
                }, 250);
              }}>
              <AppIcon name="arrow.right" size={16} color="#FFFFFF" />
              <Text style={styles.actionPrimaryText}>Read more</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.badgeRow}>
          <View style={styles.generatedBadge}>
            <Text style={styles.generatedText}>{storyLanguage === 'technical' ? 'AI enhanced' : 'template'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 18, 31, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F0F1F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5D7E0',
    alignSelf: 'center',
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14121F',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 22,
    fontWeight: '900',
    color: '#14121F',
    lineHeight: 28,
  },
  paragraph: {
    fontSize: 14.5,
    color: '#3A3852',
    lineHeight: 22,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#EFEEFB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5856D6',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  sourceText: {
    fontSize: 12,
    color: '#9AA0B5',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#5856D6',
  },
  actionSecondaryText: {
    color: '#5856D6',
    fontWeight: '700',
    fontSize: 14,
  },
  actionPrimary: {
    backgroundColor: '#5856D6',
  },
  actionPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  badgeRow: {
    alignItems: 'center',
  },
  generatedBadge: {
    backgroundColor: '#E8E9F0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  generatedText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6E7280',
    letterSpacing: 0.4,
  },
});
