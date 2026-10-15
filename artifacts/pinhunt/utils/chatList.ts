import type { ConversationMessage } from '@workspace/pin-repository';

/**
 * Messages for the chat's inverted list (UX-052, #160): newest first, so the
 * newest sits at the bottom of the screen. Input is oldest first, as the
 * repository returns it; the input array is not changed.
 */
export function chatListData(messages: ConversationMessage[]): ConversationMessage[] {
  return [...messages].reverse();
}
