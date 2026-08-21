import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ApexOrb } from '@/components/apex-logo';
import { AppIcon, type IconName } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOnboarding } from '@/context/onboarding';

const VALUE_PROPS: { icon: IconName; title: string; color: string }[] = [
  {
    icon: 'cross.case.fill',
    title: "Know who's at risk before they get hurt",
    color: '#E5484D',
  },
  {
    icon: 'checkmark.seal.fill',
    title: 'Grade every coaching decision on pure logic',
    color: '#5856D6',
  },
  {
    icon: 'bolt.fill',
    title: 'Find out if momentum is real or just a story',
    color: '#FFA058',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();

  const skip = () => {
    completeOnboarding(['NBA', 'NFL', 'MLB', 'NHL'], 'analyst');
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Animated.View entering={FadeIn.duration(700)} style={styles.orbWrap}>
          <View style={styles.orbGlow} />
          <ApexOrb size={96} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(550)} style={styles.titleWrap}>
          <Text style={styles.title}>
            Sports <Text style={styles.purple}>Intelligence</Text>
            {'\n'}
            <Text style={styles.title}>Personalized</Text>
            <Text style={styles.purple}>.</Text>
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).duration(550)}>
          <Text style={styles.tagline}>
            Apex turns injury risk, coaching decisions, and momentum into clear personal insights.
          </Text>
          <Text style={styles.taglineSub}>Built for trainers, coaches, analysts, and fans.</Text>
        </Animated.View>
      </View>

      <View style={styles.props}>
        {VALUE_PROPS.map((prop, i) => (
          <Animated.View key={prop.title} entering={FadeInDown.delay(420 + i * 120).duration(500)}>
            <Card style={styles.propCard}>
              <View style={[styles.propIcon, { backgroundColor: `${prop.color}18` }]}>
                <AppIcon name={prop.icon} size={20} color={prop.color} />
              </View>
              <Text style={styles.propText}>{prop.title}</Text>
            </Card>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInDown.delay(780).duration(550)} style={styles.footer}>
        <PillButton
          label="Get started"
          size="lg"
          variant="light"
          onPress={() => router.push('/onboarding/sport-select')}
          icon={<AppIcon name="arrow.right" size={18} color="#5856D6" />}
        />
        <Text style={styles.skip} onPress={skip}>
          Already set up? Skip
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 36,
  },
  hero: {
    alignItems: 'center',
    gap: 16,
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 140,
  },
  orbGlow: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(88, 86, 214, 0.18)',
  },
  titleWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#14121F',
    textAlign: 'center',
    lineHeight: 38,
  },
  purple: {
    color: '#5856D6',
  },
  tagline: {
    fontSize: 14.5,
    color: '#6E7280',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  taglineSub: {
    fontSize: 13.5,
    color: '#9AA0B5',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginTop: 2,
  },
  props: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  propCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  propIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#14121F',
  },
  footer: {
    gap: 14,
    alignItems: 'center',
  },
  skip: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5856D6',
  },
});
