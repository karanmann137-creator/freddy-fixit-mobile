// Session storage for supabase-js. PLAN.md §4.1.
//
// SecureStore (Keychain / Keystore) caps values near 2KB and a Supabase session is
// bigger, so: a random AES-256 key lives in SecureStore and the session, encrypted
// with it, lives in AsyncStorage (Supabase's React Native pattern, with expo-crypto).
//
// VERSIONED KEYS (review G1 #2). Each write uses a fresh key id:
//   SecureStore  "<key>.<kid>"  = AES key
//   AsyncStorage "<key>"        = "<kid>.<ciphertext>"
// The blob names its own key, so a crash between the two writes can never pair
// new ciphertext with an old key. The worst case is the previous session staying
// valid. The superseded key is deleted only after both writes succeed.
//
// IN-MEMORY COPY (CodeRabbit #4). Every write lands in `mem` first, and reads
// check it first, so a failed disk write can't lose the session mid-use. It is
// only missing after a restart, which means "sign in again", never a wrong account.
// Reads and writes never throw into supabase-js. REMOVAL is different: a sign-out
// that silently failed would leave the next launch signed in, so removeItem
// retries once and then throws.
// Known limit (device test): a read before first unlock after reboot returns
// null, which reads as signed out, not "unknown".
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import * as aesjs from "aes-js";

const hex = (b: Uint8Array) => aesjs.utils.hex.fromBytes(b);
const split = (blob: string | null) => {
  const i = blob ? blob.indexOf(".") : -1;
  return blob && i === 16 ? { kid: blob.slice(0, i), sealed: blob.slice(i + 1) } : null; // kid = 8 bytes hex
};

const mem = new Map<string, string>();
let generation = 0; // bumped by every removeItem: a read that started before it must not cache

export const secureSession = {
  async getItem(key: string): Promise<string | null> {
    if (mem.has(key)) return mem.get(key)!;
    const gen = generation;
    try {
      const parts = split(await AsyncStorage.getItem(key));
      if (!parts) return null; // missing, or the pre-versioned format: sign in again
      const keyHex = await SecureStore.getItemAsync(`${key}.${parts.kid}`);
      if (!keyHex) return null;
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      const value = aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(parts.sealed)));
      if (gen !== generation) return null; // signed out while we were reading: the old session is gone
      mem.set(key, value);
      return value;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    mem.set(key, value); // the session holds for this run whatever the disk does
    try {
      const prev = split(await AsyncStorage.getItem(key).catch(() => null));
      const kid = hex(getRandomBytes(8));
      const k = getRandomBytes(32);
      const sealed = hex(new aesjs.ModeOfOperation.ctr(k, new aesjs.Counter(1)).encrypt(aesjs.utils.utf8.toBytes(value)));
      await SecureStore.setItemAsync(`${key}.${kid}`, hex(k)); // 1. key first: unreferenced until step 2
      await AsyncStorage.setItem(key, `${kid}.${sealed}`); // 2. the switch-over
      if (prev && prev.kid !== kid) await SecureStore.deleteItemAsync(`${key}.${prev.kid}`).catch(() => {}); // 3. tidy
    } catch (e) {
      if (__DEV__) console.warn("secureSession.setItem failed; session kept in memory for this run", e);
    }
  },
  async removeItem(key: string): Promise<void> {
    generation++;
    mem.delete(key);
    const attempt = async () => {
      const prev = split(await AsyncStorage.getItem(key));
      await AsyncStorage.removeItem(key); // the blob is what makes the next launch signed in: it must go
      if (prev) await SecureStore.deleteItemAsync(`${key}.${prev.kid}`).catch(() => {}); // an orphan key decrypts nothing
    };
    try { await attempt(); } catch {
      await attempt(); // one retry; a second failure throws so sign-out can't report a success it didn't have
    }
    generation++; // again AFTER the disk is clear: a read that began mid-removal can't cache the old blob either
  },
};
