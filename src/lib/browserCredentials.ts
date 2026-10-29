import { openDB } from "idb";
import {
  parseLockRecord,
  type LockRecord,
  type LockType,
} from "@/features/settings/privacyLogic";
import { validateLockCredential } from "@/features/settings/model";
import { sameValue } from "@/features/settings/drafts";

export type BrowserLock = LockRecord & { version: 1; iterations: number };
const database = () =>
  openDB("clocked-paid-web-private", 1, {
    upgrade(db) {
      db.createObjectStore("credentials");
    },
  });
const hex = (bytes: Uint8Array) =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
export async function credentialHash(
  value: string,
  salt: string,
  iterations: number,
) {
  if (!crypto.subtle)
    throw new Error(
      "Privacy credentials require HTTPS or localhost with Web Crypto support.",
    );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode(salt),
          iterations,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  );
}
export async function readLock(): Promise<BrowserLock | null> {
  const db = await database();
  try {
    const value = await db.get("credentials", "privacy");
    if (value == null) return null;
    if (value.version !== 1 || value.iterations !== 210000)
      throw new Error(
        "Privacy configuration is unreadable. It has not been bypassed.",
      );
    const parsed = parseLockRecord(JSON.stringify(value));
    if (!parsed) throw new Error("Privacy configuration is unreadable.");
    return { ...parsed, version: 1, iterations: value.iterations };
  } finally {
    db.close();
  }
}
async function replaceLock(
  original: BrowserLock | null,
  next: BrowserLock | null,
) {
  const db = await database(),
    tx = db.transaction("credentials", "readwrite");
  try {
    const current = await tx.store.get("privacy");
    if (!sameValue(current ?? null, original))
      throw new Error(
        "Privacy settings changed in another tab. Retry with the current credential.",
      );
    if (next) await tx.store.put(next, "privacy");
    else await tx.store.delete("privacy");
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}
export async function verifyLock(record: BrowserLock, value: string) {
  if (record.blockedUntil > Date.now())
    throw new Error(
      `Too many attempts. Try again in ${Math.ceil((record.blockedUntil - Date.now()) / 1000)} seconds.`,
    );
  const hash = await credentialHash(value, record.salt, record.iterations);
  if (hash !== record.hash) {
    const failures = record.failures + 1;
    await replaceLock(record, {
      ...record,
      failures,
      blockedUntil: failures >= 5 ? Date.now() + 30000 : 0,
    });
    throw new Error("Incorrect PIN or password.");
  }
}
export async function configureLock(
  type: LockType,
  value: string,
  current: string,
) {
  const error = validateLockCredential(type, value);
  if (error) throw new Error(error);
  const original = await readLock();
  if (original) await verifyLock(original, current);
  const salt = hex(crypto.getRandomValues(new Uint8Array(24))),
    iterations = 210000;
  const record: BrowserLock = {
    version: 1,
    type,
    salt,
    iterations,
    hash: await credentialHash(value, salt, iterations),
    biometrics: false,
    failures: 0,
    blockedUntil: 0,
  };
  await replaceLock(original, record);
  return record;
}
export async function unlockCredential(value: string) {
  const original = await readLock();
  if (!original) return null;
  await verifyLock(original, value);
  const record = { ...original, failures: 0, blockedUntil: 0 };
  await replaceLock(original, record);
  return record;
}
export async function removeLock(current: string) {
  const original = await readLock();
  if (!original) return;
  await verifyLock(original, current);
  await replaceLock(original, null);
}
export async function saveMockPassword(value: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(24))),
    iterations = 210000;
  const hash = await credentialHash(value, salt, iterations),
    db = await database();
  try {
    await db.put(
      "credentials",
      { version: 1, salt, iterations, hash },
      "mock-password",
    );
  } finally {
    db.close();
  }
}
