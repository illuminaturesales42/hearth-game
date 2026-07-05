/**
 * Recovery activities the player logs by duration — cold plunge and sauna.
 * Same "log your own, on your honour" model as meditation logging: once per
 * day each, energy scaled by minutes and gently capped. Cold plunge is short
 * and intense (high per-minute), sauna is longer (lower per-minute).
 */
export interface LoggedActivity {
  id: string;
  title: string;
  sublabel: string;
  icon: string;
  energyPerMinute: number;
  maxEnergy: number;
  options: readonly number[];
  timesPerDay: number;
}

export const COLD_PLUNGE: LoggedActivity = {
  id: 'log-cold-plunge',
  title: 'Cold plunge',
  sublabel: 'Brave the cold',
  icon: '🧊',
  energyPerMinute: 3,
  maxEnergy: 12,
  options: [1, 2, 3, 5],
  timesPerDay: 1,
};

export const SAUNA: LoggedActivity = {
  id: 'log-sauna',
  title: 'Sauna',
  sublabel: 'Sweat it out',
  icon: '♨️',
  energyPerMinute: 0.7,
  maxEnergy: 15,
  options: [10, 15, 20, 30],
  timesPerDay: 1,
};

export const RECOVERY: readonly LoggedActivity[] = [COLD_PLUNGE, SAUNA];

export function findRecovery(id: string): LoggedActivity | undefined {
  return RECOVERY.find((a) => a.id === id);
}

export function recoveryEnergy(activity: LoggedActivity, minutes: number): number {
  return Math.max(0, Math.min(activity.maxEnergy, Math.round(minutes * activity.energyPerMinute)));
}
