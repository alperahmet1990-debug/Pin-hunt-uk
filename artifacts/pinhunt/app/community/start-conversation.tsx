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
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Recipient card */}
          <View style={[styles.recipientCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {(recipientName[0] ?? '?').toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={[styles.recipientLabel, { color: colors.mutedForeground }]}>Sending to</Text>
              <Text style={[styles.recipientName, { color: colors.foreground }]}>@{recipientName}</Text>
            </View>
          </View>

          {/* Context reference */}
          {hasContext && contextLabel && (
            <View style={[styles.contextBanner, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="link" size={13} color={colors.mutedForeground} />
              <Text style={[styles.contextLabel, { color: colors.mutedForeground }]} numberOfLines={2}>
                {contextLabel}
              </Text>
            </View>
          )}

          {/* Message input */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>YOUR MESSAGE</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Hi! I saw your post and…"
            placeholderTextColor={colors.mutedForeground + '88'}
            multiline
            maxLength={2000}
            autoFocus
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.card,
                borderRadius: colors.radius,
              },
            ]}
          />
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
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
                backgroundColor: message.trim() ? colors.primary : colors.secondary,
                borderRadius: colors.radius,
              },
            ]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Feather name="send" size={16} color={message.trim() ? '#fff' : colors.mutedForeground} />
                  <Text style={[styles.sendLabel, { color: message.trim() ? '#fff' : colors.mutedForeground }]}>
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
  scroll: { padding: 16, gap: 12 },
  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
  recipientLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  recipientName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  contextBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 10, borderWidth: 1,
  },
  contextLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  label: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  input: {
    borderWidth: 1, padding: 12,
    fontSize: 15, fontFamily: 'Inter_400Regular',
    minHeight: 140, textAlignVertical: 'top', lineHeight: 22,
  },
  charCount: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -8 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginTop: 8,
  },
  sendLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
