// Types for pin-identity.mjs, so routes/catalogue-import.ts can share the check.
export interface PinIdentityInput {
  title?: string | null;
  collection?: string | null;
  characters?: string[] | string | null;
}
export declare function tokens(s: unknown): Set<string>;
export declare function isPlaceholder(existing: PinIdentityInput): boolean;
export declare function checkPinIdentity(existing: PinIdentityInput, incoming: PinIdentityInput): { ok: boolean; basis: string };
export declare function identityConflictMessage(pinhuntId: string, existingTitle: string): string;
export declare function guardIdMatch(args: {
  target: { title?: string | null; collection?: string | null; all_characters?: string | null; main_character?: string | null } | null;
  matchedBy: string | null;
  pinhuntId: string;
  incoming: PinIdentityInput;
}): null | { pinhunt_id: string; existing_title: string; incoming_title: string; message: string };
