/**
 * Start Conversation screen — compose the opening message before
 * creating a new conversation with another collector.
 *
 * Called from: post detail, collector profile, traders list.
 * Params: recipientId, recipientName, contextPostId?, contextPostTitle?, contextPinId?
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import { Avatar } from '@/components/Avatar';
import { radius, spacing } from '@/constants/theme';

export default function StartConversationScreen() {
  const params = useLocalSearchParams<{
    recipientId: string;
    recipientName: string;
    contextPostId?: string;
    contextPostTitle?: string;
    contextPinId?: string;
    contextPinTitle?: string;
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { repo, userId } = useCommunity();

  const [message, setMessage] = useState('');
  const [saving,  setSaving]  = useState(false);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;
  const recipientName = params.recipientName ?? params.recipientId;

  const hasContext = !!(params.contextPostId || params.contextPinId);
  const contextLabel = params.contextPostTitle
    ? `Re: "${params.contextPostTitle}${params.contextPostTitle.length >= 60 ? '…' : ''}"`
    : params.contextPinTitle
    ? `Re: ${params.contextPinTitle}`
    : undefined;

  const handleSend = async () => {
    if (!repo || !userId) return;
    if (!message.trim()) { Alert.alert('Please type a message before sending.'); return; }
    if (!params.recipientId) return;

    try {
      setSaving(true);
      const conv = await repo.startConversation(userId, {
        recipientId: params.recipientId,
        contextPostId: params.contextPostId ?? undefined,
        contextPinId: params.contextPinId ?? undefined,
        openingMessage: message.trim(),
      });
      // Replace this screen with the chat screen
      router.replace({ pathname: '/community/chat/[id]' as any, params: { id: conv.id } });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start conversation. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: `Message @${recipientName}` }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Recipient card */}
          <View style={[styles.recipientCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <Avatar uri={null} name={recipientName} size={44} />
            <View>
              <Text style={[styles.recipientLabel, { color: colors.homeMuted }]}>Sending to</Text>
              <Text style={[styles.recipientName, { color: colors.homeInk }]}>@{recipientName}</Text>
            </View>
          </View>

          {/* Context reference */}
          {hasContext && contextLabel && (
            <View style={[styles.contextBanner, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
              <Feather name="link" size={13} color={colors.homeMuted} />
              <Text style={[styles.contextLabel, { color: colors.homeMuted }]} numberOfLines={2}>
                {contextLabel}
              </Text>
            </View>
          )}

          {/* Message input */}
          <Text style={[styles.label, { color: colors.homeMuted }]}>YOUR MESSAGE</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Hi! I saw your post and…"
            placeholderTextColor={colors.homeMuted}
            multiline
            maxLength={2000}
            autoFocus
            style={[
              styles.input,
              {
                color: colors.homeInk,
                borderColor: colors.homeLine,
                backgroundColor: colors.homeSurface,
              },
            ]}
          />
          <Text style={[styles.charCount, { color: colors.homeMuted }]}>
            {message.length} / 2000
          </Text>

          {/* Send button */}
          <TouchableOpacity
            onPress={handleSend}
            disabled={saving || !message.trim()}
            activeOpacity={0.85}
            style={[
              styles.sendBtn,
              {
                backgroundColor: message.trim() ? colors.homeCoral : colors.homeAqua,
                shadowColor: colors.homeShadow,
              },
            ]}
          >
            {saving
              ? <ActivityIndicator color={colors.homeSurface} size="small" />
              : (
                <>
                  <Feather name="send" size={16} color={message.trim() ? colors.homeSurface : colors.homeMuted} />
                  <Text style={[styles.sendLabel, { color: message.trim() ? colors.homeSurface : colors.homeMuted }]}>
                    Send Message
                  </Text>
                </>
              )
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg - 2, borderWidth: 1, borderRadius: radius.lg,
  },
  recipientLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  recipientName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  contextBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.sm + 2, borderWidth: 1, borderRadius: radius.lg,
  },
  contextLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  label: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  input: {
    borderWidth: 1, padding: spacing.md, borderRadius: radius.lg,
    fontSize: 15, fontFamily: 'Inter_400Regular',
    minHeight: 140, textAlignVertical: 'top', lineHeight: 22,
  },
  charCount: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -8 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md + 2, marginTop: spacing.sm, borderRadius: radius.lg,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  sendLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
