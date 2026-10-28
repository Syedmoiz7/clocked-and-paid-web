import type { AppState } from "../types";

export type Entitlements = {
  source: "mock";
  plan: "free" | "premium";
  jobLimit: number;
  multipleSimultaneousJobs: boolean;
  deductionsManager: boolean;
  backupRestore: boolean;
  recoveryTools: boolean;
  fullThemePalette: boolean;
  calculator: boolean;
  fullHistory: boolean;
  advancedPay: boolean;
  adsRemoved: boolean;
};
// Backend subscription data will replace this adapter; local preview is not billing verification.
export function entitlementsFor(
  data: Pick<AppState, "isPremium">,
): Entitlements {
  return {
    source: "mock",
    plan: data.isPremium ? "premium" : "free",
    jobLimit: data.isPremium ? Infinity : 1,
    multipleSimultaneousJobs: data.isPremium,
    deductionsManager: data.isPremium,
    backupRestore: data.isPremium,
    recoveryTools: data.isPremium,
    fullThemePalette: data.isPremium,
    calculator: data.isPremium,
    fullHistory: data.isPremium,
    advancedPay: data.isPremium,
    adsRemoved: data.isPremium,
  };
}
export const featureNames = {
  multipleJobs: "Multiple job profiles",
  calculator: "Hours Calculator",
  fullHistory: "Full History & Calendar",
  advancedPay: "Advanced Pay tools",
  backupRestore: "Backup & Restore",
  recoveryTools: "Data Recovery",
  fullThemePalette: "Full theme palette",
  deductionsManager: "Taxes & Deductions",
} as const;
export type UpgradeFeature = keyof typeof featureNames;
