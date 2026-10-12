export const MIN_PASSWORD_LENGTH = 8;

/**
 * Shared by registration and the update-password screen so both enforce
 * the same rules. Returns an error message, or null when valid.
 * `confirm` is optional so callers can check it separately.
 */
export function validateNewPassword(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirm !== undefined && password !== confirm) {
    return 'Passwords do not match.';
  }
  return null;
}
