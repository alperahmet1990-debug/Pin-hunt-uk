/**
 * Gate for any request that sends a photo to OpenAI or Pixian (#501).
 *
 *   const consent = useAiPhotoConsent();
 *   if (!(await consent.ensure())) return;   // nothing is sent
 *   ...
 *   return <>{screen}{consent.sheet}</>;
 *
 * `ensure()` resolves at once when permission is already stored for this
 * user and version; otherwise it shows the sheet and resolves with the
 * collector's answer. "Not now" resolves false and is not remembered.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AiPhotoConsentSheet } from '@/components/AiPhotoConsentSheet';
import { hasAiPhotoConsent, saveAiPhotoConsent } from '@/utils/aiPhotoConsent';

export function useAiPhotoConsent() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [visible, setVisible] = useState(false);
  // Everyone waiting on the sheet: a second request while it is up shares the answer.
  const pending = useRef<((ok: boolean) => void)[]>([]);

  const settle = useCallback((ok: boolean) => {
    setVisible(false);
    const waiting = pending.current;
    pending.current = [];
    waiting.forEach(resolve => resolve(ok));
  }, []);

  // Never leave a caller waiting if the screen goes away mid-question.
  useEffect(() => () => {
    const waiting = pending.current;
    pending.current = [];
    waiting.forEach(resolve => resolve(false));
  }, []);

  const ensure = useCallback(async (): Promise<boolean> => {
    if (await hasAiPhotoConsent(userId)) return true;
    return new Promise<boolean>(resolve => {
      pending.current.push(resolve);
      setVisible(true);
    });
  }, [userId]);

  const allow = useCallback(async () => {
    await saveAiPhotoConsent(userId);
    settle(true);
  }, [userId, settle]);

  const sheet = <AiPhotoConsentSheet visible={visible} onAllow={allow} onDecline={() => settle(false)} />;

  return { ensure, sheet };
}
