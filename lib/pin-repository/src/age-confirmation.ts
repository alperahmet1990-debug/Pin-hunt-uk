/**
 * Age confirmation (LP-8, #530; migration 073).
 *
 * PinHunt is for collectors aged 18 and over. The signed-in collector states
 * their date of birth once; the server works out the age from its own date
 * and keeps only when it was confirmed (or declined). The birth date is never
 * stored, logged or kept in this module.
 *
 * Everything goes through migration 073 functions: the two profile columns
 * have no client access. Until 073 is applied, get_my_age_status() doesn't
 * exist and getMyAgeStatus() answers 'unavailable', which the app treats as
 * "no check yet" so nobody is locked out by the release order.
 */
import { PinRepositoryError } from './repository';

/** The one age threshold. The database has the same value (pinhunt_minimum_age()). */
export const MINIMUM_AGE = 18;

/**
 * - confirmed: may use PinHunt.
 * - declined: said they're under 18, or a moderator closed the account as
 *   under 18. Can delete the account or sign out, nothing else.
 * - unconfirmed: hasn't been asked yet (accounts from before 073).
 * - unavailable: migration 073 isn't applied yet.
 */
export type AgeStatus = 'confirmed' | 'declined' | 'unconfirmed' | 'unavailable';

/** The slice of a Supabase client this module uses (structural, any supabase-js version). */
export interface AgeConfirmationClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Sign-up metadata key: Register checked the age on the device (no date is sent). */
export const SIGNUP_AGE_METADATA_KEY = 'age_confirmed';

function isMissingFunction(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; message?: string };
  return e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(String(e.message ?? ''));
}

function toError(error: unknown, fallback: string): PinRepositoryError {
  const e = (error ?? {}) as { code?: string; message?: string };
  const message = String(e.message ?? '');
  if (isMissingFunction(error)) {
    return new PinRepositoryError('NOT_FOUND', 'Age confirmation is not available yet.', error);
  }
  if (/age declined/i.test(message)) {
    return new PinRepositoryError('CONFLICT', 'Sorry, PinHunt is for collectors aged 18 and over.', error);
  }
  if (/invalid birth date/i.test(message)) {
    return new PinRepositoryError('INVALID_INPUT', 'Enter a real date of birth.', error);
  }
  if (/not allowed for this account/i.test(message)) {
    return new PinRepositoryError('CONFLICT', 'You can’t close this account. Admin accounts need the App Creator, and the App Creator’s account can’t be closed in the app.', error);
  }
  if (/not on your own account/i.test(message)) {
    return new PinRepositoryError('INVALID_INPUT', 'You can’t do this to your own account.', error);
  }
  return new PinRepositoryError('UPSTREAM_ERROR', fallback, error);
}

function asStatus(data: unknown): AgeStatus | null {
  return data === 'confirmed' || data === 'declined' || data === 'unconfirmed' ? data : null;
}

/** The signed-in collector's status. Throws on a network or server error, so callers don't guess. */
export async function getMyAgeStatus(client: AgeConfirmationClient): Promise<AgeStatus> {
  const { data, error } = await client.rpc('get_my_age_status');
  if (error) {
    if (isMissingFunction(error)) return 'unavailable';
    throw toError(error, 'Could not check your account. Try again.');
  }
  // No profile row yet (the sign-up trigger hasn't run): treat as not asked.
  return asStatus(data) ?? 'unconfirmed';
}

/**
 * Send a date of birth (YYYY-MM-DD) to the server, which sets confirmed or
 * declined. Only the result comes back.
 */
export async function confirmMyAge(client: AgeConfirmationClient, birthDate: string): Promise<'confirmed' | 'declined'> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new PinRepositoryError('INVALID_INPUT', 'Enter a real date of birth.');
  }
  const { data, error } = await client.rpc('confirm_my_age', { p_birth_date: birthDate });
  if (error) throw toError(error, 'Could not confirm your age. Try again.');
  const status = asStatus(data);
  if (status !== 'confirmed' && status !== 'declined') {
    throw new PinRepositoryError('UPSTREAM_ERROR', 'Could not confirm your age. Try again.');
  }
  return status;
}

/** Confirm from the sign-up metadata flag. 'unconfirmed' when the account has no flag. */
export async function confirmMyAgeFromSignup(client: AgeConfirmationClient): Promise<AgeStatus> {
  const { data, error } = await client.rpc('confirm_my_age_from_signup');
  if (error) {
    if (isMissingFunction(error)) return 'unavailable';
    throw toError(error, 'Could not confirm your age. Try again.');
  }
  return asStatus(data) ?? 'unconfirmed';
}

/**
 * Admins only (LP-9, #531): mark an account as under 18 (declined), or undo
 * that. Suspending the account is a separate call (suspendUser).
 */
export async function setAgeDeclined(client: AgeConfirmationClient, userId: string, declined: boolean): Promise<void> {
  const { error } = await client.rpc('admin_set_age_declined', { p_user_id: userId, p_declined: declined });
  if (error) throw toError(error, declined ? 'Could not close the account. Try again.' : 'Could not restore the account. Try again.');
}
