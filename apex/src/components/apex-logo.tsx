import { StyleSheet, Text, View } from 'react-native';

import { GradientView } from '@/components/ui/gradient';

interface ApexOrbProps {
  size?: number;
}

/** Gradient orb (pink → purple → orange) — the Apex brand mark. */
export function ApexOrb({ size = 64 }: ApexOrbProps) {
  return (
    <GradientView colors={['#FF5C8A', '#5856D6', '#FFA058']} style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={styles.monogram}>
        <Text style={[styles.monogramText, { fontSize: size * 0.4 }]}>A</Text>
      </View>
    </GradientView>
  );
}

interface ApexLogoProps {
  size?: number;
  showTagline?: boolean;
  dark?: boolean;
}

/** Full logo: orb + wordmark + optional tagline. */
export function ApexLogo({ size = 44, showTagline = false, dark = false }: ApexLogoProps) {
  const textColor = dark ? '#FFFFFF' : '#14121F';
  return (
    <View style={styles.row}>
      <ApexOrb size={size} />
      <View>
        <Text style={[styles.wordmark, { color: textColor }]}>
          Apex<Text style={styles.dot}>.</Text>
        </Text>
        {showTagline ? (
          <Text style={[styles.tagline, { color: dark ? 'rgba(255,255,255,0.8)' : '#6E7280' }]}>
            Sports Intelligence
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogram: {
    width: '52%',
    height: '52%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dot: {
    color: '#5856D6',
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
