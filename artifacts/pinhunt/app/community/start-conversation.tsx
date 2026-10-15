/**
 * Start Conversation screen — compose the opening message before
 * creating a new conversation with another collector.
 *
 * Called from: post detail, collector profile, traders list.
 * Params: recipientId, recipientName, contextPostId?, contextPostTitle?, contextPinId?
 *
 * From a trade match (matchTheyHave / matchIHave > 0) the screen loads the
 * matched pins, pre-fills an editable first line and attaches the pins as
 * removable chips. Nothing is sent until the collector taps Send; the pins
 * then follow the text as one existing `pin_share` message.
 */
import React, { useEffect, useState } from 'react';
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
import { formatMatchSummary, matchOpeningMessage, MATCH_PINS_LIMIT } from '@/utils/tradeMatch';
import { useCollection } from '@/context/CollectionContext';
import type { PotentialTradePin } from '@workspace/pin-repository';

export default function StartConversationScreen() {
  const params = useLocalSearchParams<{
    recipientId: string;
    recipientName: string;
    contextPostId?: string;
    contextPostTitle?: string;
    contextPinId?: string;
    contextPinTitle?: string;
    /** Potential Trade Match counts, display-only — never persisted as a trade. */
    matchTheyHave?: string;
    matchIHave?: string;
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { repo, userId } = useCommunity();

  const { collection } = useCollection();
  const matchTheyHave = Number(params.matchTheyHave ?? 0);
  const matchIHave = Number(params.matchIHave ?? 0);
  const fromMatch = matchTheyHave > 0 || matchIHave > 0;

  const [message, setMessage] = useState(() => matchOpeningMessage(matchTheyHave, matchIHave));
  const [saving,  setSaving]  = useState(false);
  // Matched pins to attach (pinhunt ids, which chat pin cards use); the sender can remove any.
  const [matchPins, setMatchPins] = useState<{ theyHave: PotentialTradePin[]; iHave: PotentialTradePin[] }>({ theyHave: [], iHave: [] });
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!fromMatch || !repo || !userId || !params.recipientId) return;
    let cancelled = false;
    repo.getPotentialTrades({ viewerId: userId, collectorId: params.recipientId })
      .then(found => {
        if (cancelled) return;
        setMatchPins({
          theyHave: found.filter(p => p.direction === 'they_have_i_want').slice(0, MATCH_PINS_LIMIT),
          iHave: found.filter(p => p.direction === 'i_have_they_want').slice(0, MATCH_PINS_LIMIT),
        });
      })
      .catch(() => {}); // Optional context: the text message still works without it.
    return () => { cancelled = true; };
  }, [fromMatch, repo, userId, params.recipientId]);

  const attachedPinIds = [...matchPins.theyHave, ...matchPins.iHave]
    .map(p => p.pinhuntId)
    .filter((id, i, all) => !removed.has(id) && all.indexOf(id) === i);
  const removePin = (pinhuntId: string) => setRemoved(prev => new Set(prev).add(pinhuntId));

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;
  const recipientName = params.recipientName ?? params.recipientId;

  const hasContext = !!(params.contextPostId || params.contextPinId);
  const contextLabel = params.contextPostTitle
    ? `Re: "${params.contextPostTitle}${params.contextPostTitle.length >= 60 ? '…' : ''}"`
    : params.contextPinTitle
    ? `Re: ${params.contextPinTitle}`
    : undefined;

  const matchSummary = formatMatchSummary(matchTheyHave, matchIHave);

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
      if (attachedPinIds.length > 0) {
        try {
          await repo.sendConversationMessage(conv.id, userId, '', {
            messageType: 'pin_share',
            pinIds: attachedPinIds,
            // Same rule as sharing from chat: flag the sender's own For Trade pins.
            forTradePinIds: attachedPinIds.filter(id => collection[id]?.status === 'for_trade'),
          });
        } catch {
          // The conversation and text went through; the pins can be shared again from chat.
        }
      }
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

          {/* Potential Trade Match context — display only, no trade is created here */}
          {matchSummary && (
            <View style={[styles.matchBanner, { backgroundColor: colors.homeCoral + '12', borderColor: colors.homeCoral + '30' }]}>
              <Feather name="repeat" size={13} color={colors.homeCoral} />
              <Text style={[styles.matchLabel, { color: colors.homeCoral }]} numberOfLines={2}>
                {matchSummary}
              </Text>
            </View>
          )}

          {/* Matched pins, sent as one pin card after the text; each can be removed */}
          {[
            { key: 'theyHave', label: 'THEY HAVE, YOU WANT', pins: matchPins.theyHave },
            { key: 'iHave', label: 'YOU CAN OFFER', pins: matchPins.iHave },
          ].map(group => {
            const visible = group.pins.filter(p => !removed.has(p.pinhuntId));
            if (visible.length === 0) return null;
            return (
              <View key={group.key} style={styles.pinGroup}>
                <Text style={[styles.label, { color: colors.homeMuted }]}>{group.label}</Text>
                <View style={styles.pinChips}>
                  {visible.map(p => (
                    <View key={p.pinhuntId} style={[styles.pinChip, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                      <Text style={[styles.pinChipLabel, { color: colors.homeInk }]} numberOfLines={1}>{p.title}</Text>
                      <TouchableOpacity
                        onPress={() => removePin(p.pinhuntId)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${p.title}`}
                        style={styles.pinChipRemove}
                      >
                        <Feather name="x" size={14} color={colors.homeMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          {attachedPinIds.length > 0 && (
            <Text style={[styles.attachNote, { color: colors.homeMuted }]}>
              {attachedPinIds.length} pin{attachedPinIds.length === 1 ? '' : 's'} will be shared after your message.
            </Text>
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
            autoFocus={!fromMatch}
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

  matchBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.sm + 2, borderWidth: 1, borderRadius: radius.lg,
  },
  matchLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },

  label: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  pinGroup: { gap: spacing.xs },
  pinChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    paddingLeft: spacing.md, paddingRight: spacing.xs, minHeight: 34, borderWidth: 1, borderRadius: radius.pill,
  },
  pinChipLabel: { flexShrink: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  pinChipRemove: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  attachNote: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -4 },
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
