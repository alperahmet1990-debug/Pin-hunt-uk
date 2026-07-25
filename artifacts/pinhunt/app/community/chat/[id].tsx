/**
 * Conversation Chat screen — messages between two collectors.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Stack, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import type { Conversation, ConversationMessage } from '@workspace/pin-repository';

function MessageBubble({ msg, isMe, colors }: {
  msg: ConversationMessage; isMe: boolean; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View style={[
        styles.bubble,
        { backgroundColor: isMe ? colors.primary : colors.card, borderColor: colors.border },
        isMe && styles.bubbleMe,
      ]}>
        <Text style={[styles.bubbleText, { color: isMe ? '#fff' : colors.foreground }]}>
          {msg.body}
        </Text>
        <Text style={[styles.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.mutedForeground }]}>
          {new Date(msg.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { repo, userId } = useCommunity();

  const [conv,      setConv]     = useState<Conversation | null>(null);
  const [messages,  setMessages] = useState<ConversationMessage[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [error,     setError]    = useState<string | null>(null);
  const [msgText,   setMsgText]  = useState('');
  const [sending,   setSending]  = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async (isInitial = false) => {
    if (!repo || !userId || !id) { setLoading(false); return; }
    try {
      if (isInitial) setLoading(true);
      const [c, msgs] = await Promise.all([
        isInitial ? repo.getConversation(id, userId) : Promise.resolve(conv),
        repo.getConversationMessages(id),
      ]);
      if (isInitial) setConv(c);
      setMessages(msgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversation.');
    } finally {
      setLoading(false);
    }
  }, [repo, userId, id, conv]);

  useEffect(() => { load(true); }, [repo, userId, id]);

  // Poll for new messages every 8 s
  useEffect(() => {
    const interval = setInterval(() => load(false), 8_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleSend = async () => {
    if (!repo || !userId || !id || !msgText.trim()) return;
    try {
      setSending(true);
      const msg = await repo.sendConversationMessage(id, userId, msgText.trim());
      setMessages(prev => [...prev, msg]);
      setMsgText('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const otherName = conv?.otherParticipant?.username
    ? `@${conv.otherParticipant.username}`
    : 'Conversation';

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 8;

  return (
    <>
      <Stack.Screen options={{ title: otherName }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.length === 0 && (
                <View style={styles.emptyMessages}>
                  <Text style={[styles.emptyMsgText, { color: colors.mutedForeground }]}>
                    No messages yet. Say hello!
                  </Text>
                </View>
              )}
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isMe={msg.senderId === userId}
                  colors={colors}
                />
              ))}
            </ScrollView>

            {/* Input bar */}
            <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: botPad }]}>
              <TextInput
                value={msgText}
                onChangeText={setMsgText}
                placeholder="Type a message…"
                placeholderTextColor={colors.mutedForeground + '88'}
                style={[styles.msgInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: 22 }]}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!msgText.trim() || sending}
                activeOpacity={0.85}
                style={[styles.sendBtn, { backgroundColor: msgText.trim() ? colors.primary : colors.secondary, borderRadius: 22 }]}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Feather name="send" size={16} color={msgText.trim() ? '#fff' : colors.mutedForeground} />
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  messageList: { flex: 1 },
  emptyMessages: { alignItems: 'center', paddingVertical: 40 },
  emptyMsgText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', padding: 10, borderRadius: 16, borderWidth: 1, gap: 3 },
  bubbleMe: { borderRadius: 16, borderWidth: 0 },
  bubbleText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  bubbleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  msgInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
    maxHeight: 120, borderWidth: 1,
  },
  sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
