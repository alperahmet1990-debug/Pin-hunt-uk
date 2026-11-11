/**
 * Date of birth checks for Register and Confirm age (LP-8, #530).
 *
 * Pure functions, no storage. Register uses checkBirthDate() on the device
 * and sends nothing when the collector is under 18; Confirm age sends the
 * date to the server, which decides again with its own date.
 */
import { MINIMUM_AGE } from '@workspace/pin-repository';

export { MINIMUM_AGE };

export type BirthDateCheck =
  | { kind: 'invalid' }
  | { kind: 'under_age'; isoDate: string }
  | { kind: 'ok'; isoDate: string };

export const DOB_LABEL = 'Date of birth';
export const DOB_HINT =
  'PinHunt is for collectors aged 18 and over. We only keep confirmation of your age, not your date of birth.';
export const UNDER_AGE_MESSAGE = 'Sorry, PinHunt is for collectors aged 18 and over.';
export const INVALID_DOB_MESSAGE = 'Enter a real date of birth, as day, month and year.';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Whole years between the birth date and `today`, by calendar date (a 29 February birthday counts from 1 March). */
export function ageOn(birth: { year: number; month: number; day: number }, today: Date): number {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const beforeBirthday = m < birth.month || (m === birth.month && d < birth.day);
  return y - birth.year - (beforeBirthday ? 1 : 0);
}

/**
 * Checks three typed fields. Invalid: empty, not numbers, not a real calendar
 * date, in the future, or before 1900. `today` is the device's local date.
 */
export function checkBirthDate(day: string, month: string, year: string, today: Date = new Date()): BirthDateCheck {
  const parts = [day, month, year].map(s => s.trim());
  if (!/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1]) || !/^\d{4}$/.test(parts[2])) {
    return { kind: 'invalid' };
  }
  const [d, m, y] = parts.map(Number);
  if (m < 1 || m > 12 || d < 1 || y < 1900) return { kind: 'invalid' };
  // Real calendar date: 31 April or 29 February 2023 roll over in Date.
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    return { kind: 'invalid' };
  }
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (probe.getTime() > todayStart.getTime()) return { kind: 'invalid' };

  const isoDate = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  if (ageOn({ year: y, month: m, day: d }, today) < MINIMUM_AGE) return { kind: 'under_age', isoDate };
  return { kind: 'ok', isoDate };
}

/** Keeps only digits, up to `max` characters, as the fields are typed. */
export function digitsOnly(text: string, max: number): string {
  return text.replace(/\D/g, '').slice(0, max);
}
