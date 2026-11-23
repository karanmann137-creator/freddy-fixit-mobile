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
// Never throws into supabase-js: a failed read is null (signed out), a failed
// write is logged in dev and dropped (the session lives in memory until the next
// successful write, so the person is not signed out mid-use).
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

export const secureSession = {
  async getItem(key: string): Promise<string | null> {
    try {
      const parts = split(await AsyncStorage.getItem(key));
      if (!parts) return null; // missing, or the pre-versioned format: sign in again
      const keyHex = await SecureStore.getItemAsync(`${key}.${parts.kid}`);
      if (!keyHex) return null;
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(parts.sealed)));
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const prev = split(await AsyncStorage.getItem(key).catch(() => null));
      const kid = hex(getRandomBytes(8));
      const k = getRandomBytes(32);
      const sealed = hex(new aesjs.ModeOfOperation.ctr(k, new aesjs.Counter(1)).encrypt(aesjs.utils.utf8.toBytes(value)));
      await SecureStore.setItemAsync(`${key}.${kid}`, hex(k)); // 1. key first: unreferenced until step 2
      await AsyncStorage.setItem(key, `${kid}.${sealed}`); // 2. the switch-over
      if (prev && prev.kid !== kid) await SecureStore.deleteItemAsync(`${key}.${prev.kid}`).catch(() => {}); // 3. tidy
    } catch (e) {
      if (__DEV__) console.warn("secureSession.setItem failed; session kept in memory only", e);
    }
  },
  async removeItem(key: string): Promise<void> {
    const prev = split(await AsyncStorage.getItem(key).catch(() => null));
    await AsyncStorage.removeItem(key).catch(() => {});
    if (prev) await SecureStore.deleteItemAsync(`${key}.${prev.kid}`).catch(() => {});
  },
};
