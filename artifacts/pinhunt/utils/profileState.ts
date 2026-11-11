/**
 * Whether to send someone to Complete Profile. A profile that failed to load
 * says nothing about their username, so it must never count as missing one.
 */
export function needsUsernameFor(input: {
  hasSession: boolean;
  profileLoaded: boolean;
  loadFailed: boolean;
  username?: string | null;
}): boolean {
  return input.hasSession && input.profileLoaded && !input.loadFailed && !input.username;
}

/**
 * Age gate (LP-8, #530). Only a status the server actually returned moves
 * anyone: a failed check (null) or a database without migration 073
 * ('unavailable') sends nobody anywhere.
 */
export function ageGateFor(input: {
  hasSession: boolean;
  ageStatus: 'confirmed' | 'declined' | 'unconfirmed' | 'unavailable' | null;
}): { needsAgeConfirmation: boolean; ageDeclined: boolean } {
  if (!input.hasSession) return { needsAgeConfirmation: false, ageDeclined: false };
  return {
    needsAgeConfirmation: input.ageStatus === 'unconfirmed',
    ageDeclined: input.ageStatus === 'declined',
  };
}
