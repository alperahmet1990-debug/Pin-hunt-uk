import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Rendered by a route whose feature flag is off (see constants/features.ts).
 * Goes back, or to Home when there is nothing to go back to (deep link).
 */
export function FeatureOffRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
