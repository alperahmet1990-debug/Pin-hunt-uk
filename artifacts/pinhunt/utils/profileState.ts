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
