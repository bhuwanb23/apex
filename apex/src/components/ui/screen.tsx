import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConnectivityBanner } from '@/components/connectivity-banner';
import { MaxContentWidth, Spacing } from '@/constants/theme';

interface ScreenProps extends ScrollViewProps {
  children: ReactNode;
  /** Add bottom padding for the floating tab bar. Defaults to true. */
  tabInset?: boolean;
  /** Vertically center content (used by onboarding). */
  centered?: boolean;
  background?: string;
}

/** Standard app screen: gray canvas, safe area, scrollable, centered max-width. */
export function Screen({
  children,
  tabInset = true,
  centered = false,
  background = '#F0F1F5',
  contentContainerStyle,
  ...rest
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          tabInset && styles.tabInset,
          centered && styles.centered,
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        {...rest}>
        <View style={styles.inner}>
          <ConnectivityBanner />
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    flexGrow: 1,
  },
  tabInset: {
    // The flat tab bar sits in normal flow below the scroll content, so only
    // a little breathing room is needed (the old 110 was for the floating pill).
    paddingBottom: 24,
  },
  centered: {
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
});
