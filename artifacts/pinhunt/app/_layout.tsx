import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CollectionProvider } from '@/context/CollectionContext';
import { BoardsProvider } from '@/context/BoardsContext';
import { PinCatalogueProvider } from '@/context/PinCatalogueContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProfileProvider, useProfile } from '@/context/ProfileContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ─── Auth + profile guard ─────────────────────────────────────────────────────
// Watches session and profile state, redirecting as needed:
//   • No session → /(auth)/login
//   • Session + no username → /complete-profile
//   • Session + username → /(tabs) (if still in auth group)
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { needsUsername, loading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inCompleteProfile = segments[0] === 'complete-profile';
    const inTabs = segments[0] === '(tabs)';

    if (!session && !inAuthGroup) {
      // Not signed in — send to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Just signed in — check if profile is complete
      if (needsUsername) {
        router.replace('/complete-profile');
      } else {
        router.replace('/(tabs)');
      }
    } else if (session && needsUsername && !inCompleteProfile) {
      // Signed in but no username yet — must complete profile
      router.replace('/complete-profile');
    } else if (session && !needsUsername && inCompleteProfile) {
      // Profile now complete — move into the app
      router.replace('/(tabs)');
    }
  }, [session, loading, needsUsername, segments, router]);

  if (loading) return null;

  return <>{children}</>;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="complete-profile" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="find-collectors" options={{ title: 'Find Collectors' }} />
      <Stack.Screen name="collector/[username]" options={{ title: 'Collector' }} />
      <Stack.Screen name="pin/[id]" options={{ title: 'Pin Detail' }} />
      <Stack.Screen name="board/[id]" options={{ title: 'Board' }} />
      <Stack.Screen name="sell/[pinId]" options={{ title: 'List for Sale' }} />
      <Stack.Screen name="my-listings" options={{ title: 'My Listings' }} />
      <Stack.Screen name="add-pin" options={{ title: 'Add Pin' }} />
      <Stack.Screen name="my-submissions" options={{ title: 'My Submissions' }} />
      <Stack.Screen name="submission/[id]" options={{ title: 'Submission' }} />
      <Stack.Screen name="edit-submission/[id]" options={{ title: 'Edit Submission' }} />
    </Stack>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ProfileProvider>
              <PinCatalogueProvider>
                <CollectionProvider>
                  <BoardsProvider>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                      <KeyboardProvider>
                        <AuthGuard>
                          <RootLayoutNav />
                        </AuthGuard>
                      </KeyboardProvider>
                    </GestureHandlerRootView>
                  </BoardsProvider>
                </CollectionProvider>
              </PinCatalogueProvider>
            </ProfileProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
