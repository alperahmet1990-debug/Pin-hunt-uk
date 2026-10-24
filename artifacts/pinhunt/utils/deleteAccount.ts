/**
 * Client call for DELETE /api/account (#13). Maps the server's responses to
 * the outcome the confirmation screen acts on.
 */
import { API_BASE } from '@/lib/apiBase';

export const DELETE_CONFIRM_WORD = 'DELETE';

export type DeleteAccountOutcome = 'deleted' | 'unauthorized' | 'not_allowed' | 'retry';

/** The confirm button stays disabled until the user has typed DELETE exactly. */
export function isDeleteConfirmed(input: string): boolean {
  return input.trim() === DELETE_CONFIRM_WORD;
}

export async function requestAccountDeletion(accessToken: string | undefined): Promise<DeleteAccountOutcome> {
  if (!accessToken) return 'unauthorized';
  try {
    const res = await fetch(`${API_BASE}/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) return 'deleted';
    if (res.status === 401) return 'unauthorized';
    if (res.status === 409) return 'not_allowed';
    return 'retry';
  } catch {
    return 'retry';
  }
}
