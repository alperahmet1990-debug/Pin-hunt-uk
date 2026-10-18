import { UPDATE_PASSWORD_ROUTE } from '@/utils/recoveryLink';

// Maps the password-reset deep link (`pinhunt://reset#…`) onto the
// update-password screen. The recovery tokens in the fragment are consumed by
// AuthContext via expo-linking, not by routing.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  if (/^\/*reset(?:[/?#]|$)/i.test(bare)) {
    return UPDATE_PASSWORD_ROUTE;
  }
  // Sign-up confirmation (`pinhunt://confirm#…`): land on login; AuthGuard
  // moves the user on once AuthContext has set the session from the link.
  if (/^\/*confirm(?:[/?#]|$)/i.test(bare)) {
    return '/(auth)/login';
  }
  return path;
}
