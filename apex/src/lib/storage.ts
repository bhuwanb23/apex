/**
 * Tiny storage shim with the AsyncStorage API (`getItem`/`setItem`).
 *
 * Currently in-memory: onboarding choices survive for the app session (which
 * is what the demo needs — fresh launch shows onboarding again). Swapping in
 * real persistence is a one-line change per call site:
 *
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *   export const storage = AsyncStorage;
 */

type StorageValue = string | null;

const store = new Map<string, string>();

export const storage = {
  async getItem(key: string): Promise<StorageValue> {
    return store.has(key) ? (store.get(key) as string) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
};
