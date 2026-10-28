export type LockType = "pin4" | "pin6" | "password";
export type LockRecord = {
  type: LockType;
  salt: string;
  hash: string;
  biometrics: boolean;
  failures: number;
  blockedUntil: number;
};
export function parseLockRecord(raw: string | null): LockRecord | null {
  if (raw == null) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Privacy configuration is unreadable. Retry secure storage; the lock has not been bypassed.",
    );
  }
  if (
    !parsed ||
    !["pin4", "pin6", "password"].includes(parsed.type) ||
    typeof parsed.salt !== "string" ||
    !parsed.salt ||
    parsed.salt.length > 250 ||
    typeof parsed.hash !== "string" ||
    !/^[0-9a-f]{64}$/i.test(parsed.hash) ||
    (parsed.biometrics !== undefined &&
      typeof parsed.biometrics !== "boolean") ||
    (parsed.failures !== undefined &&
      (!Number.isSafeInteger(parsed.failures) || parsed.failures < 0)) ||
    (parsed.blockedUntil !== undefined &&
      (!Number.isSafeInteger(parsed.blockedUntil) || parsed.blockedUntil < 0))
  )
    throw new Error(
      "Privacy configuration is unreadable. Retry secure storage; the lock has not been bypassed.",
    );
  return {
    type: parsed.type,
    salt: parsed.salt,
    hash: parsed.hash.toLowerCase(),
    biometrics: parsed.biometrics ?? false,
    failures: parsed.failures ?? 0,
    blockedUntil: parsed.blockedUntil ?? 0,
  };
}
export class PrivacyAttemptGate {
  private revision = 0;
  begin() {
    return this.revision;
  }
  lock() {
    this.revision++;
  }
  appState(state: string, authenticationPrompt: boolean) {
    if (state !== "active" && !(state === "inactive" && authenticationPrompt))
      this.lock();
  }
  canUnlock(token: number, appState: string) {
    return token === this.revision && appState === "active";
  }
}
export function privacyOperations() {
  let pending = false;
  return async <T>(operation: () => Promise<T>) => {
    if (pending)
      throw new Error("Another privacy action is in progress. Please wait.");
    pending = true;
    try {
      return await operation();
    } finally {
      pending = false;
    }
  };
}
