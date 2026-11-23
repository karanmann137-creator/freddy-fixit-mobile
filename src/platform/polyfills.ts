// Imported FIRST by the root layout. Only what synced web code needs and React
// Native lacks; each entry says which file needs it.
import { digest, CryptoDigestAlgorithm } from "expo-crypto";

// passwordStrength.checkPwned (synced) hashes with crypto.subtle.digest("SHA-1")
// and quietly skips the breach check when subtle is missing. Hermes has no
// SubtleCrypto, so without this the app would never warn about a breached
// password. Only `digest` is provided, and only the algorithms expo-crypto has.
const ALG: Record<string, CryptoDigestAlgorithm> = {
  "SHA-1": CryptoDigestAlgorithm.SHA1,
  "SHA-256": CryptoDigestAlgorithm.SHA256,
  "SHA-384": CryptoDigestAlgorithm.SHA384,
  "SHA-512": CryptoDigestAlgorithm.SHA512,
};
const g = globalThis as unknown as { crypto?: { subtle?: unknown } & Record<string, unknown> };
if (!g.crypto) g.crypto = {};
if (!g.crypto.subtle) {
  g.crypto.subtle = {
    digest: (algorithm: string | { name: string }, data: BufferSource) => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      const alg = ALG[name.toUpperCase()];
      if (!alg) return Promise.reject(new Error(`digest: unsupported algorithm ${name}`));
      return digest(alg, data);
    },
  };
}
