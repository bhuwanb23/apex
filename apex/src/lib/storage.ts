/**
 * Storage wrapper — real device persistence via AsyncStorage.
 *
 * Onboarding choices, sport/role preferences, and story language survive
 * app restarts. Keep using this module (not AsyncStorage directly) so a
 * single import point exists.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = AsyncStorage;

/** Prefix for device-cached API payloads (see use-api-data). */
export const DEVICE_CACHE_PREFIX = 'aqx.data.';

/** Removes every device-cached API payload (the offline fallback data).
 *  Preferences / auth / onboarding stay untouched. */
export async function clearDeviceCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(k => k.startsWith(DEVICE_CACHE_PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // Never throw from a settings tap — best-effort clear.
  }
}
