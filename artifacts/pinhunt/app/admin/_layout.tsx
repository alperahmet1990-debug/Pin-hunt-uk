/**
 * Admin layout — guards all /admin/* routes behind the is_admin DB flag.
 * Non-admins are immediately redirected back to the Profile tab.
 *
 * Catalogue-editing routes are additionally App Creator only (migration
 * 041): plain admins see a locked state there. The database and API server
 * enforce the same rule — this is just so admins don't hit failing saves.
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMyAccess } from '@/hooks/useMyAccess';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

// First path segment under /admin that only the App Creator may open.
const APP_CREATOR_ROUTES = new Set([
  'catalogue', 'pin', 'import', 'catalogue-validation', 'image-backfill',
  'ebay-image-dryrun', 'vision-test',
]);

export default function AdminLayout() {
  const { profile, loading } = useProfile();
  const { session } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const segments = useSegments();
  const { isAppCreator, loading: accessLoading } = useMyAccess();
  const adminRoute = (segments as string[])[(segments as string[]).indexOf('admin') + 1];
  const creatorOnly = !!adminRoute && APP_CREATOR_ROUTES.has(adminRoute);

  useEffect(() => {
    if (loading) return;
    if (!session || !profile?.isAdmin) {
      router.replace('/(tabs)/profile');
    }
  }, [loading, session, profile, router]);

  if (loading || (creatorOnly && accessLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.homeBackground }}>
        <ActivityIndicator color={colors.homeCoral} />
      </View>
    );
  }

  // Render null while redirect fires for non-admins
  if (!profile?.isAdmin) return null;

  if (creatorOnly && !isAppCreator) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.homeBackground }}>
        <Stack.Screen options={{ title: 'Admin' }} />
        <Feather name="lock" size={28} color={colors.homeMuted} />
        <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', color: colors.homeMuted }}>
          Catalogue editing is limited to the App Creator.
        </Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index"        options={{ title: 'Admin' }} />
      <Stack.Screen name="submissions"  options={{ title: 'Submission Queue' }} />
      <Stack.Screen name="review/[id]"  options={{ title: 'Review Submission' }} />
      <Stack.Screen name="catalogue"    options={{ title: 'Catalogue' }} />
      <Stack.Screen name="pin/[id]"     options={{ title: 'Pin Editor' }} />
      <Stack.Screen name="community-moderation" options={{ title: 'Community Moderation' }} />
      <Stack.Screen name="catalogue-validation" options={{ title: 'Catalogue Validation' }} />
    </Stack>
  );
}
