import React from 'react';
import {
  Platform,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Badge, Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSubmissionNotifications } from '@/context/SubmissionNotificationsContext';
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

// ─── Raised scan button (ClassicTabLayout only) ───────────────────────────────

function ScanTabButton({ onPress }: { onPress?: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.scanBtn}
    >
      <View style={[styles.scanBtnRing, { borderColor: colors.background }]}>
        <LinearGradient
          colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.scanBtnInner, { shadowColor: colors.primary }]}
        >
          <Feather name="camera" size={26} color="#FFFFFF" />
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
}

// ─── Native tab layout (iOS Liquid Glass / native look) ───────────────────────

function NativeTabLayout() {
  const { totalUnread } = useUnreadMessages();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'safari', selected: 'safari.fill' }} />
        <Label>Discover</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community">
        <Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
        <Label>Community</Label>
        {totalUnread > 0 && <Badge>{totalUnread > 9 ? '9+' : String(totalUnread)}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <Icon sf={{ default: 'camera.circle.fill', selected: 'camera.circle.fill' }} />
        <Label>Find</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="collection">
        <Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
        <Label>Collection</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ─── Profile tab icon with optional badge dot ─────────────────────────────────

function ProfileTabIcon({ color, hasBadge }: { color: string; hasBadge: boolean }) {
  const isIOS = Platform.OS === 'ios';
  return (
    <View>
      {isIOS ? (
        <SymbolView name="person" tintColor={color} size={24} />
      ) : (
        <Feather name="user" size={22} color={color} />
      )}
      {hasBadge && (
        <View style={styles.badgeDot} />
      )}
    </View>
  );
}

// ─── Classic tab layout (Android + Web) ──────────────────────────────────────

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const { unseenCount } = useSubmissionNotifications();
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
      {/* Discover (index) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="safari" tintColor={color} size={24} />
            ) : (
              <Feather name="compass" size={22} color={color} />
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

      {/* Find — raised central button */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Find',
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <ScanTabButton onPress={props.onPress ? () => (props.onPress as (() => void))() : undefined} />
          ),
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

      {/* Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <ProfileTabIcon color={color} hasBadge={unseenCount > 0} />
          ),
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
  scanBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  scanBtnRing: {
    borderRadius: 34,
    borderWidth: 3,
    marginBottom: 4,
  },
  scanBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow (iOS)
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    // Elevation (Android)
    elevation: 10,
  },
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
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
});
