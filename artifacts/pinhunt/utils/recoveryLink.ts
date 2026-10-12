/**
 * Password-recovery deep link parsing (`pinhunt://reset#access_token=…&type=recovery`).
 * Pure helpers so the routing rules are unit-testable without React.
 */

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string };

/** Extracts recovery credentials from a deep link, or null if it is not one. */
export function parseRecoveryLink(url: string | null | undefined): RecoveryLink | null {
  if (!url || !/^[a-z][a-z0-9+.-]*:\/\/\/?reset(?:[/?#]|$)|\/reset(?:[/?#]|$)/i.test(url)) {
    return null;
  }
  const hashIdx = url.indexOf('#');
  const queryIdx = url.indexOf('?');
  const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
  const query =
    queryIdx >= 0 ? url.slice(queryIdx + 1, hashIdx > queryIdx ? hashIdx : undefined) : '';

  const frag = new URLSearchParams(fragment);
  const accessToken = frag.get('access_token');
  const refreshToken = frag.get('refresh_token');
  if (accessToken && refreshToken && frag.get('type') === 'recovery') {
    return { kind: 'tokens', accessToken, refreshToken };
  }
  const code = new URLSearchParams(query).get('code');
  return code ? { kind: 'code', code } : null;
}

export const UPDATE_PASSWORD_ROUTE = '/(auth)/update-password';

export type GuardTarget =
  | '/(auth)/login'
  | '/complete-profile'
  | '/(tabs)'
  | typeof UPDATE_PASSWORD_ROUTE
  | null;

/**
 * Where AuthGuard should send the user. A recovery session may reach the
 * update-password screen and nothing else until the password is updated.
 */
export function resolveGuardTarget(args: {
  hasSession: boolean;
  isRecovery: boolean;
  needsUsername: boolean;
  segments: readonly string[];
}): GuardTarget {
  const { hasSession, isRecovery, needsUsername, segments } = args;
  const inAuthGroup = segments[0] === '(auth)';
  const inCompleteProfile = segments[0] === 'complete-profile';
  const inUpdatePassword = inAuthGroup && segments[1] === 'update-password';

  if (hasSession && isRecovery) return inUpdatePassword ? null : UPDATE_PASSWORD_ROUTE;
  if (!hasSession && !inAuthGroup) return '/(auth)/login';
  if (hasSession && inAuthGroup) return needsUsername ? '/complete-profile' : '/(tabs)';
  if (hasSession && needsUsername && !inCompleteProfile) return '/complete-profile';
  if (hasSession && !needsUsername && inCompleteProfile) return '/(tabs)';
  return null;
}
