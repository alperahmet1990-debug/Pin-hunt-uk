/** Same rule as sign-in/registration: an email must be entered. */
export function validateResetEmail(email: string): string | null {
  return email.trim() ? null : 'Please enter your email.';
}
