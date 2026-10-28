export type TabKey = "tracker" | "history" | "pay" | "jobs" | "settings";

export type Shift = {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string | null;
  lunchMinutes: number;
  breakMinutes: number;
  earnings: number;
  tips?: number;
  tipType?: "cash" | "paycheck" | "card" | "other" | null;
  missingClockIn?: boolean;
  historyLunchStart?: string | null;
  historyLunchEnd?: string | null;
  breaks?: { id: string; start: string; end: string | null; label?: string }[];
  jobId?: string | null;
  breakLabel?: string | null;
  lunchStartedAt?: string | null;
  breakStartedAt?: string | null;
  entryType?: "shift" | "project";
  projectName?: string | null;
  endDate?: string | null;
  flatAmount?: number | null;
  currency?: string | null;
  projectNotes?: string | null;
  customRate?: number | null;
  overtimeThreshold?: number;
  overtimeMultiplier?: number;
  lunchPaid?: boolean;
  paid?: boolean;
  paidAt?: string | null;
  paidByPaycheckId?: string | null;
};

export type Deduction = {
  id: string;
  label: string;
  amount: number;
  currency?: string;
  frequency:
    "daily" | "weekly" | "per-pay-period" | "monthly" | "yearly" | "one-time";
  enabled: boolean;
  jobId?: string | null;
  isPercentage?: boolean;
  beforeTax?: boolean;
  taxSetAside?: boolean;
  applicableFromDate?: string;
  applicableToDate?: string;
  payDate?: string;
  notes?: string;
  consumedByPaycheckId?: string;
};

export type MockJob = {
  id: string;
  name: string;
  hourlyRate: number;
  color: string;
  currency?: string;
  payFrequency?: "weekly" | "biweekly" | "semi-monthly" | "monthly";
  payPeriodStart?: string;
  payPeriodEnd?: string;
  nextPayDate?: string;
  payDelayDays?: number;
  overtimeThreshold?: number;
  overtimeMultiplier?: number;
  title?: string;
  notes?: string;
  isDefault?: boolean;
  archived?: boolean;
  lunchMinutes?: number;
  lunchEnabled?: boolean;
  enableTips?: boolean;
  reminderSettings?: JobReminderSettings;
  createdAt?: string;
};

export type CustomReminder = {
  id: string;
  name: string;
  message: string;
  enabled: boolean;
  trigger: "after-clock-in" | "after-lunch-start" | "at-time";
  offsetMinutes: number;
  atTime: string;
  repeatMinutes: number;
  priority: "low" | "medium" | "high";
};

export type JobReminderSettings = {
  lunchMode: "off" | "relative" | "fixed";
  lunchHours: number;
  lunchTime: string;
  returnReminder: boolean;
  repeatMinutes: number;
  snoozeMinutes: number;
  sound: boolean;
  indicator: boolean;
  overlay: boolean;
  custom: CustomReminder[];
};

export type MockPaycheck = {
  id: string;
  jobId: string;
  startDate: string;
  endDate: string;
  paid: boolean;
  payDate?: string;
  grossPay?: number;
  totalDeductions?: number;
  netPay?: number;
  hoursWorked?: number;
  shiftCount?: number;
  notes?: string;
  currency?: string;
  createdAt?: string;
};

export type PayFrequency = NonNullable<MockJob["payFrequency"]>;
export type PaySchedule = {
  frequency: PayFrequency;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  payDelayDays: number;
  anchorDate?: string;
  customPeriod?: boolean;
};

export type TodayPlan = {
  plannedHours: number;
  lunchEnabled: boolean;
  lunchMinutes: number;
  hourlyRate: number;
  overtimeThreshold: number;
  overtimeMultiplier: number;
  planningMode: "duration" | "end-time";
  plannedClockOut: string | null;
  timerDirection: "count-up" | "count-down";
};

export type ReminderSettings = {
  lunchReminder: boolean;
  returnReminder: boolean;
  customReminderMinutes: number | null;
  reminderSnoozeMinutes: number;
  reminderOverlay: boolean;
  reminderSound: boolean;
  reminderTabFlash: boolean;
};

export type AppState = {
  preferences: AppPreferences;
  account: MockAccount;
  auth: MockAuthState;
  activeShift: Shift | null;
  extraShifts: Shift[];
  history: Shift[];
  hourlyRate: number;
  isPremium: boolean;
  todayPlan: TodayPlan;
  trackerDay?: string;
  reminders: ReminderSettings;
  jobs: MockJob[];
  selectedJobId: string;
  deductionRate: number;
  defaultPlan: TodayPlan;
  orphanedShift: Shift | null;
  breakIncludedInRemaining: boolean;
  notificationPermission: "default" | "granted" | "denied";
  notificationPromptDismissed: boolean;
  scheduledLunchReminderId: string | null;
  scheduledReturnReminderId: string | null;
  deductions: Deduction[];
  paychecks: MockPaycheck[];
  payVisible: boolean;
  paySchedules: Record<string, PaySchedule>;
  jobReminderAcknowledgements: Record<string, number>;
};

export type MockAccount = {
  mode: "guest" | "mock";
  name: string;
  email: string;
};
export type MockAuthFlow = {
  id: string;
  kind: "confirmation" | "recovery";
  email: string;
  name: string;
  createdAt: number;
  plan?: "free" | "premium";
};
export type MockAuthState = {
  session: "signed-out" | "guest" | "mock";
  lastProfile: { name: string; email: string } | null;
  pending: MockAuthFlow | null;
  onboarding: {
    complete: boolean;
    step: 1 | 2;
    createdJobIds: string[];
    lastSavedJobId: string | null;
  };
  guestConversionAt: string | null;
};
export type AppPreferences = {
  enableManualEditing: boolean;
  allowConcurrentShifts: boolean;
  showDailyQuote: boolean;
  clockFormat: "12h" | "24h";
  typicalStartTime: string;
  payHiddenByDefault: boolean;
  headerTimerMode: "off" | "count-up" | "count-down";
  themeHue: number;
  currency: string;
  defaultReminders: JobReminderSettings;
};
