import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AqxOrb } from '@/components/aqx-logo';
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
    completeOnboarding(['NBA', 'NFL'], 'analyst');
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <AqxOrb size={88} />
        <Text style={styles.title}>
          Sports{' '}
          <Text style={styles.purple}>
            Intelligence
            {'\n'}
          </Text>
          <Text style={styles.title}>Personalized</Text>
          <Text style={styles.purple}>.</Text>
        </Text>
        <Text style={styles.tagline}>Your smart assistant for every game, every decision, every risk.</Text>
      </View>

      <View style={styles.props}>
        {VALUE_PROPS.map(prop => (
          <Card key={prop.title} style={styles.propCard}>
            <View style={[styles.propIcon, { backgroundColor: `${prop.color}18` }]}>
              <AppIcon name={prop.icon} size={20} color={prop.color} />
            </View>
            <Text style={styles.propText}>{prop.title}</Text>
          </Card>
        ))}
      </View>

      <View style={styles.footer}>
        <PillButton
          label="Get started"
          size="lg"
          onPress={() => router.push('/onboarding/sport-select')}
          icon={<AppIcon name="arrow.right" size={18} color="#FFFFFF" />}
        />
        <Text style={styles.skip} onPress={skip}>
          Already set up? Skip
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    gap: 18,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#14121F',
    textAlign: 'center',
    lineHeight: 40,
  },
  purple: {
    color: '#5856D6',
  },
  tagline: {
    fontSize: 15,
    color: '#6E7280',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  props: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 24,
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
