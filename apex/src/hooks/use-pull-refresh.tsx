import { useCallback, useState } from 'react';
import { RefreshControl, type ColorValue } from 'react-native';

/**
 * Pull-to-refresh wiring for list screens: a `refreshing` state plus a
 * `RefreshControl` ready to pass to the `Screen`/`ScrollView` component.
 *
 * The spinner is held for a short minimum so the pull gesture always gives
 * visible feedback, even when the backend answers instantly (same pattern as
 * the alerts screen's manual refresh).
 */
export function usePullRefresh(refetch: () => void, tintColor: ColorValue = '#5856D6') {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    // Keep the indicator visible briefly; the refetch itself may be cached and
    // resolve in a few milliseconds.
    setTimeout(() => setRefreshing(false), 900);
  }, [refetch]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={tintColor}
      colors={[tintColor as string]}
    />
  );

  return { refreshControl, refreshing };
}
