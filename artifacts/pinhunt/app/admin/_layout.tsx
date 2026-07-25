/**
 * Admin layout — guards all /admin/* routes behind the is_admin DB flag.
 * Non-admins are immediately redirected back to the Profile tab.
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function AdminLayout() {
  const { profile, loading } = useProfile();
  const { session } = useAuth();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    if (loading) return;
    if (!session || !profile?.isAdmin) {
      router.replace('/(tabs)/profile');
    }
  }, [loading, session, profile, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Render null while redirect fires for non-admins
  if (!profile?.isAdmin) return null;

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index"        options={{ title: 'Admin' }} />
      <Stack.Screen name="submissions"  options={{ title: 'Submission Queue' }} />
      <Stack.Screen name="review/[id]"  options={{ title: 'Review Submission' }} />
      <Stack.Screen name="catalogue"    options={{ title: 'Catalogue' }} />
      <Stack.Screen name="pin/[id]"     options={{ title: 'Pin Editor' }} />
      <Stack.Screen name="community-moderation" options={{ title: 'Community Moderation' }} />
    </Stack>
  );
}
