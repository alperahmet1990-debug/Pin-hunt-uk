/**
 * Client call for POST /api/admin/messages/:id/remove (#524). Maps the
 * server's responses to what the moderation card shows.
 */
import { API_BASE } from '@/lib/apiBase';
import { MESSAGE_REMOVAL_REASON_MAX } from '@workspace/pin-repository';

export type RemoveMessageOutcome =
  | { ok: true; alreadyRemoved: boolean }
  | { ok: false; message: string };

/** A reason is required: 1–500 characters after trimming. */
export function isValidRemovalReason(reason: string): boolean {
  const t = reason.trim();
  return t.length > 0 && t.length <= MESSAGE_REMOVAL_REASON_MAX;
}

export async function requestMessageRemoval(
  accessToken: string | undefined,
  messageId: string,
  reason: string,
): Promise<RemoveMessageOutcome> {
  if (!accessToken) return { ok: false, message: 'Sign in again to remove messages.' };
  if (!isValidRemovalReason(reason)) {
    return { ok: false, message: `Give a reason of up to ${MESSAGE_REMOVAL_REASON_MAX} characters.` };
  }
  try {
    const res = await fetch(`${API_BASE}/admin/messages/${encodeURIComponent(messageId)}/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; alreadyRemoved?: boolean } | null;
    if (res.status === 200) return { ok: true, alreadyRemoved: !!body?.alreadyRemoved };
    if (res.status === 401) return { ok: false, message: 'Sign in again to remove messages.' };
    if (res.status === 403) return { ok: false, message: 'Only admins can remove messages.' };
    return { ok: false, message: body?.error || 'Could not remove the message. Try again.' };
  } catch {
    return { ok: false, message: 'Could not reach PinHunt. Check your connection and try again.' };
  }
}
