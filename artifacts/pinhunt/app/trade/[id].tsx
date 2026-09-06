/**
 * Trade Chat screen — messages, status controls, and post-trade rating.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
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
import { useMarketplace } from '@/hooks/useMarketplace';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { radius, spacing } from '@/constants/theme';
import {
  isDismissedValue,
  persistBannerDismissal,
  tradeBannerDismissalKey,
} from '@/utils/tradeBannerDismissals';
import type { PotentialTradePin, Trade, TradeMessage, TradeStatus } from '@workspace/pin-repository';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TradeStatus, string> = {
  pending:   'Pending — awaiting response',
  accepted:  'Accepted — arrange the trade',
  rejected:  'Declined',
  completed: 'Completed ✓',
  cancelled: 'Cancelled',
};
function statusColor(status: TradeStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case 'pending': return colors.homeSandInk;
    case 'accepted': return colors.forTrade;
    case 'rejected': return colors.destructive;
    case 'completed': return colors.owned;
    case 'cancelled': return colors.homeMuted;
  }
}

// ─── Potential match banner ───────────────────────────────────────────────────

function PotentialMatchBanner({
  pins,
  colors,
  onDismiss,
  onPinPress,
}: {
  pins: PotentialTradePin[];
  colors: ReturnType<typeof useColors>;
  onDismiss: () => void;
  onPinPress: (pinhuntId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const theyHave = pins.filter(p => p.direction === 'they_have_i_want');
  const iHave    = pins.filter(p => p.direction === 'i_have_they_want');

  return (
    <View style={[bannerStyles.container, { backgroundColor: colors.homeCoral + '12', borderColor: colors.homeCoral + '40' }]}>
      {/* Header row */}
      <View style={bannerStyles.header}>
        <View style={bannerStyles.headerLeft}>
          <Feather name="shuffle" size={14} color={colors.homeCoral} />
          <Text style={[bannerStyles.headerTitle, { color: colors.homeCoral }]}>Potential match</Text>
          <Text style={[bannerStyles.headerCount, { color: colors.homeCoral + 'BB' }]}>
            {pins.length} pin{pins.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={bannerStyles.headerActions}>
          <TouchableOpacity onPress={() => setCollapsed(c => !c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={colors.homeCoral} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: spacing.md }}>
            <Feather name="x" size={16} color={colors.homeMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pin lists */}
      {!collapsed && (
        <View style={{ gap: spacing.sm + 2 }}>
          {theyHave.length > 0 && (
            <View style={{ gap: spacing.xs + 2 }}>
              <Text style={[bannerStyles.groupLabel, { color: colors.homeMuted }]}>They have · you want</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bannerStyles.pinRow}>
                {theyHave.map(pin => (
                  <TouchableOpacity
                    key={pin.pinId}
                    onPress={() => onPinPress(pin.pinhuntId)}
                    activeOpacity={0.8}
                    style={[bannerStyles.pinCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                  >
                    {pin.imageUrl ? (
                      <Image source={{ uri: pin.imageUrl }} style={bannerStyles.pinImage} resizeMode="cover" />
                    ) : (
                      <View style={[bannerStyles.pinImagePlaceholder, { backgroundColor: colors.homeAqua }]}>
                        <Feather name="image" size={18} color={colors.homeMuted} />
                      </View>
                    )}
                    <Text style={[bannerStyles.pinTitle, { color: colors.homeInk }]} numberOfLines={2}>
                      {pin.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {iHave.length > 0 && (
            <View style={{ gap: spacing.xs + 2 }}>
              <Text style={[bannerStyles.groupLabel, { color: colors.homeMuted }]}>You have · they want</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bannerStyles.pinRow}>
                {iHave.map(pin => (
                  <TouchableOpacity
                    key={pin.pinId}
                    onPress={() => onPinPress(pin.pinhuntId)}
                    activeOpacity={0.8}
                    style={[bannerStyles.pinCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                  >
                    {pin.imageUrl ? (
                      <Image source={{ uri: pin.imageUrl }} style={bannerStyles.pinImage} resizeMode="cover" />
                    ) : (
                      <View style={[bannerStyles.pinImagePlaceholder, { backgroundColor: colors.homeAqua }]}>
                        <Feather name="image" size={18} color={colors.homeMuted} />
                      </View>
                    )}
                    <Text style={[bannerStyles.pinTitle, { color: colors.homeInk }]} numberOfLines={2}>
                      {pin.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container:       { margin: spacing.sm + 2, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm + 2 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  headerTitle:     { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  headerCount:     { fontSize: 12, fontFamily: 'Inter_400Regular' },
  headerActions:   { flexDirection: 'row', alignItems: 'center' },
  groupLabel:      { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.4 },
  pinRow:          { gap: spacing.sm, paddingRight: spacing.xs },
  pinCard:         { width: 80, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden', gap: spacing.xs, paddingBottom: spacing.xs + 2 },
  pinImage:        { width: 80, height: 80 },
  pinImagePlaceholder: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  pinTitle:        { fontSize: 11, fontFamily: 'Inter_400Regular', paddingHorizontal: 5, lineHeight: 14 },
});

// ─── Rating modal ─────────────────────────────────────────────────────────────

function RatingPrompt({ otherUserId, tradeId, onDone, colors, repo, userId }: {
  otherUserId: string;
  tradeId: string;
  onDone: () => void;
  colors: ReturnType<typeof useColors>;
  repo: ReturnType<typeof useMarketplace>['repo'];
  userId: string | null;
}) {
  const [comment, setComment]   = useState('');
  const [saving,  setSaving]    = useState(false);
  const [done,    setDone]      = useState(false);

  const submit = async (isPositive: boolean) => {
    if (!repo || !userId) return;
    try {
      setSaving(true);
      await repo.createTradeRating(userId, {
        tradeId,
        rateeId: otherUserId,
        isPositive,
        comment: comment.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      Alert.alert('Rating failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.ratingBox, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <Text style={[styles.ratingTitle, { color: colors.homeInk }]}>Rating submitted! 👍</Text>
        <TouchableOpacity onPress={onDone} style={{ padding: spacing.sm }}>
          <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.ratingBox, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <Text style={[styles.ratingTitle, { color: colors.homeInk }]}>Rate this trade</Text>
      <Text style={[styles.ratingSub, { color: colors.homeMuted }]}>
        How was your experience with this trader?
      </Text>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Optional comment…"
        placeholderTextColor={colors.homeMuted}
        style={[styles.ratingInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
        multiline
      />
      {saving ? (
        <ActivityIndicator color={colors.homeCoral} />
      ) : (
        <View style={styles.ratingBtns}>
          <TouchableOpacity
            onPress={() => submit(false)}
            activeOpacity={0.85}
            style={[styles.ratingBtn, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '55' }]}
          >
            <Feather name="thumbs-down" size={18} color={colors.destructive} />
            <Text style={[styles.ratingBtnLabel, { color: colors.destructive }]}>Negative</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => submit(true)}
            activeOpacity={0.85}
            style={[styles.ratingBtn, { backgroundColor: colors.owned + '18', borderColor: colors.owned + '55' }]}
          >
            <Feather name="thumbs-up" size={18} color={colors.owned} />
            <Text style={[styles.ratingBtnLabel, { color: colors.owned }]}>Positive</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity onPress={onDone} style={{ padding: spacing.sm }}>
        <Text style={[styles.skipLabel, { color: colors.homeMuted }]}>Skip rating</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe, colors }: {
  msg: TradeMessage; isMe: boolean; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View style={[
        styles.bubble,
        { backgroundColor: isMe ? colors.homeCoral : colors.homeSurface, borderColor: colors.homeLine },
        isMe && styles.bubbleMe,
      ]}>
        <Text style={[styles.bubbleText, { color: isMe ? colors.homeSurface : colors.homeInk }]}>
          {msg.message}
        </Text>
        <Text style={[styles.bubbleTime, { color: isMe ? colors.homeSurface + '99' : colors.homeMuted }]}>
          {new Date(msg.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TradeScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useMarketplace();

  const [trade,          setTrade]          = useState<Trade | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [msgText,        setMsgText]        = useState('');
  const [sending,        setSending]        = useState(false);
  const [actioning,      setActioning]      = useState(false);
  const [showRating,     setShowRating]     = useState(false);
  const [potentialPins,  setPotentialPins]  = useState<PotentialTradePin[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Load persisted dismissal state for this trade
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(tradeBannerDismissalKey(id))
      .then(val => { if (isDismissedValue(val)) setBannerDismissed(true); })
      .catch(() => { /* ignore */ });
  }, [id]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    if (id) {
      persistBannerDismissal(id).catch(() => { /* ignore */ });
    }
  }, [id]);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!repo || !id) { setLoading(false); return; }
    try {
      const t = await repo.getTrade(id);
      if (!t) { setError('Trade not found.'); setLoading(false); return; }
      setTrade(t);
      // Re-fetch potential pins on every load so the banner stays current if
      // either collector adds or removes pins while the chat is open.
      if (userId) {
        const otherId = t.initiatorId === userId ? t.recipientId : t.initiatorId;
        repo.getPotentialTrades({ viewerId: userId, collectorId: otherId })
          .then(pins => setPotentialPins(pins))
          .catch(() => { /* silently ignore — banner just won't appear */ });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trade.');
    } finally {
      setLoading(false);
    }
  }, [repo, id, userId]);

  useEffect(() => { load(); }, [load]);

  // Keep a stable reference to `load` so the realtime subscription below
  // doesn't tear down and resubscribe every time the callback identity changes.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Live updates via Supabase Realtime (replaces the old 10 s poll):
  //  * trade_messages for this trade → new messages appear instantly
  //  * trades row for this trade → status banner/actions update when the
  //    other collector accepts/declines/completes/cancels
  //  * user_pins for either collector → potential-match banner stays current
  // RLS still applies to delivered events, so each collector only receives
  // rows they are allowed to select. Channel is removed on unmount.
  const initiatorId = trade?.initiatorId;
  const recipientId = trade?.recipientId;
  useEffect(() => {
    if (!isSupabaseConfigured || !id || !userId || !initiatorId || !recipientId) return;

    const channel = supabase
      .channel(`trade-chat-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_messages', filter: `trade_id=eq.${id}` },
        () => { loadRef.current(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `id=eq.${id}` },
        () => { loadRef.current(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_pins', filter: `user_id=in.(${initiatorId},${recipientId})` },
        () => { loadRef.current(); },
      )
      .subscribe(status => {
        // On (re)connect, run one catch-up fetch so anything that happened
        // while the channel was down is picked up.
        if (status === 'SUBSCRIBED') { loadRef.current(); }
      });

    return () => { supabase.removeChannel(channel); };
  }, [id, userId, initiatorId, recipientId]);

  // Realtime sockets are suspended while the app is backgrounded, so events
  // sent during that window are lost. Run one catch-up fetch whenever the app
  // returns to the foreground (no polling).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') { loadRef.current(); }
    });
    return () => { sub.remove(); };
  }, []);

  const sendMessage = async () => {
    if (!repo || !userId || !trade || !msgText.trim()) return;
    try {
      setSending(true);
      await repo.sendTradeMessage(trade.id, userId, msgText.trim());
      setMsgText('');
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: TradeStatus) => {
    if (!repo || !trade) return;
    try {
      setActioning(true);
      await repo.updateTradeStatus(trade.id, status);
      await load();
      if (status === 'completed') setShowRating(true);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setActioning(false);
    }
  };

  const isInitiator = trade?.initiatorId === userId;
  const isRecipient = trade?.recipientId === userId;
  const otherUserId = trade ? (isInitiator ? trade.recipientId : trade.initiatorId) : null;
  const messages    = trade?.messages ?? [];
  const isActive    = trade && !['rejected', 'completed', 'cancelled'].includes(trade.status);
  const botPad      = Platform.OS === 'web' ? 24 : insets.bottom + 8;

  const showBanner = potentialPins.length > 0 && !bannerDismissed;

  const handlePinPress = (pinhuntId: string) => {
    router.push({ pathname: '/pin/[id]', params: { id: pinhuntId } });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Trade Request' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : !trade ? null : (
          <>
            {/* Status banner */}
            <View style={[styles.statusBar, { backgroundColor: statusColor(trade.status, colors) + '18', borderBottomColor: statusColor(trade.status, colors) + '33' }]}>
              <Text style={[styles.statusText, { color: statusColor(trade.status, colors) }]}>
                {STATUS_LABEL[trade.status]}
              </Text>
            </View>

            {/* Trade note */}
            {trade.notes ? (
              <View style={[styles.noteBox, { backgroundColor: colors.homeAqua, borderBottomColor: colors.homeLine }]}>
                <Feather name="info" size={12} color={colors.homeMuted} />
                <Text style={[styles.noteText, { color: colors.homeMuted }]}>{trade.notes}</Text>
              </View>
            ) : null}

            {/* Potential match banner */}
            {showBanner && (
              <PotentialMatchBanner
                pins={potentialPins}
                colors={colors}
                onDismiss={dismissBanner}
                onPinPress={handlePinPress}
              />
            )}

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.length === 0 && (
                <View style={styles.emptyMessages}>
                  <Text style={[styles.emptyMsgText, { color: colors.homeMuted }]}>
                    No messages yet. Start the conversation!
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

              {/* Rating prompt after completion */}
              {showRating && otherUserId && (
                <RatingPrompt
                  otherUserId={otherUserId}
                  tradeId={trade.id}
                  onDone={() => setShowRating(false)}
                  colors={colors}
                  repo={repo}
                  userId={userId}
                />
              )}
            </ScrollView>

            {/* Action buttons */}
            {actioning ? (
              <View style={[styles.actionBar, { borderTopColor: colors.homeLine }]}>
                <ActivityIndicator color={colors.homeCoral} />
              </View>
            ) : (
              <View style={[styles.actionBar, { borderTopColor: colors.homeLine, backgroundColor: colors.homeBackground }]}>
                {/* Recipient: accept or reject pending */}
                {isRecipient && trade.status === 'pending' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={() => updateStatus('rejected')}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '55' }]}
                    >
                      <Text style={[styles.actionBtnLabel, { color: colors.destructive }]}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateStatus('accepted')}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: colors.owned + '18', borderColor: colors.owned + '55' }]}
                    >
                      <Text style={[styles.actionBtnLabel, { color: colors.owned }]}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Either party: mark complete or cancel while accepted/pending */}
                {isActive && trade.status === 'accepted' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Cancel trade?', 'This cannot be undone.', [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes, cancel', style: 'destructive', onPress: () => updateStatus('cancelled') },
                      ])}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
                    >
                      <Text style={[styles.actionBtnLabel, { color: colors.homeMuted }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Mark as completed?', 'This means the trade has been successfully completed.', [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes, completed', onPress: () => updateStatus('completed') },
                      ])}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }]}
                    >
                      <Text style={[styles.actionBtnLabel, { color: colors.homeSurface }]}>Mark Complete</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Initiator: cancel pending */}
                {isInitiator && trade.status === 'pending' && (
                  <TouchableOpacity
                    onPress={() => updateStatus('cancelled')}
                    activeOpacity={0.85}
                    style={[styles.actionBtnFull, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
                  >
                    <Text style={[styles.actionBtnLabel, { color: colors.homeMuted }]}>Cancel Request</Text>
                  </TouchableOpacity>
                )}

                {/* Rate after completion (re-show prompt) */}
                {trade.status === 'completed' && !showRating && (
                  <TouchableOpacity
                    onPress={() => setShowRating(true)}
                    activeOpacity={0.85}
                    style={[styles.actionBtnFull, { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }]}
                  >
                    <Text style={[styles.actionBtnLabel, { color: colors.homeSurface }]}>Rate this Trade</Text>
                  </TouchableOpacity>
                )}

                {/* Message input (active trades only) */}
                {isActive && (
                  <View style={[styles.inputRow, { borderTopColor: colors.homeLine }]}>
                    <TextInput
                      value={msgText}
                      onChangeText={setMsgText}
                      placeholder="Type a message…"
                      placeholderTextColor={colors.homeMuted}
                      style={[styles.msgInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
                      multiline
                      maxLength={1000}
                    />
                    <TouchableOpacity
                      onPress={sendMessage}
                      disabled={!msgText.trim() || sending}
                      activeOpacity={0.85}
                      style={[styles.sendBtn, { backgroundColor: msgText.trim() ? colors.homeCoral : colors.homeAqua }]}
                    >
                      {sending
                        ? <ActivityIndicator color={colors.homeSurface} size="small" />
                        : <Feather name="send" size={16} color={msgText.trim() ? colors.homeSurface : colors.homeMuted} />
                      }
                    </TouchableOpacity>
                  </View>
                )}

                {/* Pad for device home indicator */}
                <View style={{ height: botPad }} />
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  statusBar: { padding: spacing.md, borderBottomWidth: 1, alignItems: 'center' },
  statusText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  noteBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  noteText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  messageList: { flex: 1 },
  emptyMessages: { alignItems: 'center', paddingVertical: spacing.xxxl + spacing.sm },
  emptyMsgText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', padding: spacing.sm + 2, borderRadius: radius.lg, borderWidth: 1, gap: 3 },
  bubbleMe: { borderRadius: radius.lg, borderWidth: 0 },
  bubbleText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  bubbleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right' },
  actionBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, gap: spacing.sm + 2 },
  actionRow: { flexDirection: 'row', gap: spacing.sm + 2 },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md - 1, borderWidth: 1, borderRadius: radius.sm },
  actionBtnFull: { alignItems: 'center', paddingVertical: spacing.md - 1, borderWidth: 1, borderRadius: radius.sm },
  actionBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm + 2, borderTopWidth: StyleSheet.hairlineWidth },
  msgInput: { flex: 1, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, fontSize: 14, fontFamily: 'Inter_400Regular', maxHeight: 120, borderWidth: 1, borderRadius: 22 },
  sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  // Rating
  ratingBox: { padding: spacing.lg, borderWidth: 1, borderRadius: radius.md, gap: spacing.md, marginTop: spacing.sm },
  ratingTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  ratingSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  ratingInput: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm + 2, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 60, textAlignVertical: 'top' },
  ratingBtns: { flexDirection: 'row', gap: spacing.md },
  ratingBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderWidth: 1, borderRadius: radius.sm },
  ratingBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  skipLabel: { textAlign: 'center', fontSize: 13, fontFamily: 'Inter_400Regular' },
});
