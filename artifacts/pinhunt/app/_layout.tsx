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

// ─── Auth guard ────────────────────────────────────────────────────────────────
// Watches session state and redirects to /(auth)/login when unauthenticated.
// Must be rendered inside <AuthProvider>.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Not signed in — redirect to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Signed in — leave auth screens
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  // While checking session, render nothing (splash is still showing)
  if (loading) return null;

  return <>{children}</>;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pin/[id]" options={{ title: 'Pin Detail' }} />
      <Stack.Screen name="board/[id]" options={{ title: 'Board' }} />
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
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
