/**
 * Accounts created before the sign-up fix have their email address stored in
 * profiles.display_name. Never surface that (or a blank value) as a name, so
 * callers fall back to the username.
 */
export function safeDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  if (!name || name.includes('@')) return undefined;
  return name;
}
