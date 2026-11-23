// Small key/value store for per-device preferences (theme, drafts, dismissals).
// The native stand-in for the web's localStorage. Never throws: storage is a
// convenience, and a failed read means "use the default", never a crash.
// Not for anything secret (that's secureSession) or anything shared between
// devices (that's the database).
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function kvGet(key: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}
export async function kvSet(key: string, value: string): Promise<void> {
  try { await AsyncStorage.setItem(key, value); } catch { /* best effort */ }
}
export async function kvRemove(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(key); } catch { /* best effort */ }
}
export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
export async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kvSet(key, JSON.stringify(value));
}
