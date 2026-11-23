// Session storage for supabase-js. PLAN.md §4.1.
//
// SecureStore (Keychain / Keystore) caps values near 2KB and a Supabase session is
// bigger, so: a random AES-256 key per item lives in SecureStore, and the session
// encrypted with it lives in AsyncStorage. This is the pattern from Supabase's
// React Native guide, with expo-crypto as the random source.
//
// Every failure reads as "no session" (null), never a throw: supabase-js treats
// null as signed out, and readAuthUser() still separates signedOut from unknown.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import * as aesjs from "aes-js";

const enc = (bytes: Uint8Array) => aesjs.utils.hex.fromBytes(bytes);

export const secureSession = {
  async getItem(key: string): Promise<string | null> {
    try {
      const sealed = await AsyncStorage.getItem(key);
      if (!sealed) return null;
      const keyHex = await SecureStore.getItemAsync(key);
      if (!keyHex) return null;
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(sealed)));
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = getRandomBytes(32);
    const cipher = new aesjs.ModeOfOperation.ctr(k, new aesjs.Counter(1));
    const sealed = enc(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
    await SecureStore.setItemAsync(key, enc(k));
    await AsyncStorage.setItem(key, sealed);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key).catch(() => {});
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
