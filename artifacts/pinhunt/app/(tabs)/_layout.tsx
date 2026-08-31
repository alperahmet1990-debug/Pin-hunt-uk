import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Badge, Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { Text } from 'react-native';

// ─── Community tab icon with unread-message count badge ──────────────────────

function CommunityTabIcon({ color, count }: { color: string; count: number }) {
  const isIOS = Platform.OS === 'ios';
  return (
    <View>
      {isIOS ? (
        <SymbolView name="bubble.left.and.bubble.right" tintColor={color} size={24} />
      ) : (
        <Feather name="message-circle" size={22} color={color} />
      )}
      {count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Native tab layout (iOS Liquid Glass / native look) ───────────────────────

function NativeTabLayout() {
  const { totalUnread } = useUnreadMessages();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <Icon sf={{ default: 'magnifyingglass', selected: 'magnifyingglass' }} />
        <Label>Find</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trades">
        <Icon sf={{ default: 'arrow.left.arrow.right', selected: 'arrow.left.arrow.right' }} />
        <Label>Trades</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="collection">
        <Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
        <Label>Collection</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community">
        <Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
        <Label>Community</Label>
        {totalUnread > 0 && <Badge>{totalUnread > 9 ? '9+' : String(totalUnread)}</Badge>}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ─── Classic tab layout (Android + Web) ──────────────────────────────────────

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const { totalUnread } = useUnreadMessages();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 84 : undefined,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
      }}
    >
      {/* Home (index) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />

      {/* Find */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Find',
          tabBarIcon: ({ color }) => isIOS
            ? <SymbolView name="magnifyingglass" tintColor={color} size={24} />
            : <Feather name="search" size={22} color={color} />,
        }}
      />

      {/* Trades */}
      <Tabs.Screen
        name="trades"
        options={{
          title: 'Trades',
          tabBarIcon: ({ color }) => isIOS
            ? <SymbolView name="arrow.left.arrow.right" tintColor={color} size={22} />
            : <Feather name="repeat" size={22} color={color} />,
        }}
      />

      {/* Collection */}
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Collection',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="heart" tintColor={color} size={24} />
            ) : (
              <Ionicons name="heart-outline" size={22} color={color} />
            ),
        }}
      />

      {/* Community */}
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color }) => <CommunityTabIcon color={color} count={totalUnread} />,
        }}
      />

    </Tabs>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  countBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },
});
