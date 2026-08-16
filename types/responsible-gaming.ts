export type ResponsibleGaming = {
  sessionStartedAt: string;
  sessionLimitMinutes?: number;
  reminderIntervalMinutes: number;
  pausedUntil?: string;
  selfExcluded: boolean;
  lastReminderAt?: string;
};
