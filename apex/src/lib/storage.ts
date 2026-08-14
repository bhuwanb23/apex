/**
 * Storage wrapper — real device persistence via AsyncStorage.
 *
 * Onboarding choices, sport/role preferences, and story language survive
 * app restarts. Keep using this module (not AsyncStorage directly) so a
 * single import point exists.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = AsyncStorage;
