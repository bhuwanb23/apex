import { StyleSheet, Text, View } from 'react-native';

import { GradientView } from '@/components/ui/gradient';

interface AqxOrbProps {
  size?: number;
}

/** Gradient orb (pink → purple → orange) — the AQX brand mark. */
export function AqxOrb({ size = 64 }: AqxOrbProps) {
  return (
    <GradientView colors={['#FF5C8A', '#5856D6', '#FFA058']} style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={styles.monogram}>
        <Text style={[styles.monogramText, { fontSize: size * 0.4 }]}>A</Text>
      </View>
    </GradientView>
  );
}

interface AqxLogoProps {
  size?: number;
  showTagline?: boolean;
  dark?: boolean;
}

/** Full logo: orb + wordmark + optional tagline. */
export function AqxLogo({ size = 44, showTagline = false, dark = false }: AqxLogoProps) {
  const textColor = dark ? '#FFFFFF' : '#14121F';
  return (
    <View style={styles.row}>
      <AqxOrb size={size} />
      <View>
        <Text style={[styles.wordmark, { color: textColor }]}>
          AQX<Text style={styles.dot}>.</Text>
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
