import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '@narraza/application';

export interface Argon2Params {
  memoryKiB: number;
  timeCost: number;
  parallelism: number;
}

/**
 * argon2id password hasher (D21). `dummyVerify` runs a real verify against a
 * fixed hash (same params) so login timing for unknown emails is
 * indistinguishable from a wrong password — no enumeration via response time.
 */
export function createArgon2Hasher(params: Argon2Params): PasswordHasher {
  // @node-rs/argon2 defaults algorithm to Argon2id (the recommended variant),
  // so we set only the cost params. Avoids importing its const enum, which
  // isolatedModules forbids.
  const options = {
    memoryCost: params.memoryKiB,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  };

  // Precompute the dummy hash once (with the same cost params).
  let dummyHashPromise: Promise<string> | null = null;
  const dummyHash = () => (dummyHashPromise ??= hash('narraza-dummy-verify-target', options));

  return {
    async hash(password) {
      return hash(password, options);
    },
    async verify(hashStr, password) {
      try {
        return await verify(hashStr, password);
      } catch {
        return false;
      }
    },
    async dummyVerify(password) {
      try {
        await verify(await dummyHash(), password);
      } catch {
        /* ignore */
      }
      return false;
    },
  };
}
