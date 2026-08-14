import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AqxOrb } from '@/components/aqx-logo';

const DURATION = 650;

/** Full-screen brand overlay that fades out shortly after mount. */
export function AqxSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const fadeKeyframe = new Keyframe({
    0: { opacity: 1 },
    60: { opacity: 1 },
    100: { opacity: 0, easing: Easing.inOut(Easing.ease) },
  });

  const orbKeyframe = new Keyframe({
    0: { transform: [{ scale: 0.6 }], opacity: 0 },
    35: { transform: [{ scale: 1 }], opacity: 1, easing: Easing.out(Easing.back(1.4)) },
    100: { transform: [{ scale: 1.1 }], opacity: 0, easing: Easing.in(Easing.ease) },
  });

  const content = (
    <Animated.View entering={orbKeyframe.duration(DURATION + 150)} style={styles.orbWrap}>
      <AqxOrb size={92} />
    </Animated.View>
  );

  return animate ? (
    <Animated.View
      entering={fadeKeyframe.duration(DURATION + 250).withCallback(finished => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.overlay}>
      {content}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setAnimate(true));
      }}
      style={styles.overlay}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F0F1F5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
