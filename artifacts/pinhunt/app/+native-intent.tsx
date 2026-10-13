import { UPDATE_PASSWORD_ROUTE } from '@/utils/recoveryLink';

// Maps the password-reset deep link (`pinhunt://reset#…`) onto the
// update-password screen. The recovery tokens in the fragment are consumed by
// AuthContext via expo-linking, not by routing.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (/^\/*reset(?:[/?#]|$)/i.test(path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''))) {
    return UPDATE_PASSWORD_ROUTE;
  }
  return path;
}
