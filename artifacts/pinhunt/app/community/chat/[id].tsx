/**
 * Conversation chat — text, photos, collection pin shares, and a simple
 * trade-agreement marker for trade-post conversations.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, InteractionManager, KeyboardAvoidingView, Modal, Platform,
  FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import { uploadCommunityPhoto } from '@/utils/communityPhoto';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin, CommunityPost, Conversation, ConversationMessage } from '@workspace/pin-repository';
import { PinImage } from '@/components/ui/PinImage';
import { chatListData } from '@/utils/chatList';
import { ErrorState } from '@/components/ui/ErrorState';
import { toUserError, userErrorLine, type UserError } from '@/utils/userError';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { UserSafetySheet } from '@/components/UserSafetySheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { otherParticipantId } from '@/utils/blockedUsers';

/** Space between messages (FlatList content has no `gap`). */
function MessageGap() {
  return <View style={styles.messageGap} />;
}

function previewBody(msg: ConversationMessage) {
  if (msg.body.trim()) return msg.body;
  if (msg.messageType === 'pin_share') return `${msg.pinIds.length} pin${msg.pinIds.length === 1 ? '' : 's'} shared`;
  if (msg.messageType === 'photo') return `${msg.photoUrls.length} photo${msg.photoUrls.length === 1 ? '' : 's'} shared`;
  return 'Message';
}

function MessageBubble({ msg, isMe, colors, pins, onLongPress }: {
  msg: ConversationMessage; isMe: boolean; colors: ReturnType<typeof useColors>;
  pins: Map<string, CataloguePin>;
  /** Their messages only: press and hold to report or block (B-P0-05b, #17). */
  onLongPress?: (msg: ConversationMessage) => void;
}) {
  const router = useRouter();
  const bubbleStyle = [styles.bubble, { backgroundColor: isMe ? colors.homeCoral : colors.homeSurface, borderColor: colors.homeLine }, isMe && styles.bubbleMe];
  // Only their messages respond to a long press; everything else stays a plain View.
  const actionProps = !isMe && onLongPress ? {
    onLongPress: () => onLongPress(msg),
    delayLongPress: 350,
    // Pin shares keep their pin buttons reachable by screen readers.
    accessible: msg.messageType !== 'pin_share',
    accessibilityLabel: previewBody(msg),
    accessibilityHint: 'Press and hold to report or block',
    accessibilityActions: [{ name: 'longpress', label: 'Report or block' }],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
      if (e.nativeEvent.actionName === 'longpress') onLongPress(msg);
    },
    testID: `message-${msg.id}`,
  } : null;
  const Bubble = actionProps ? Pressable : View;
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <Bubble {...actionProps} style={bubbleStyle}>
        {msg.messageType === 'photo' && msg.photoUrls.length > 0 && (
          <View style={styles.photoGrid}>
            {msg.photoUrls.map((url, index) => <Image key={`${url}-${index}`} source={{ uri: url }} accessibilityLabel={`Photo ${index + 1} of ${msg.photoUrls.length}${isMe ? ' you sent' : ''}`} style={[styles.sharedPhoto, { backgroundColor: colors.homeLine }]} />)}
          </View>
        )}
        {msg.messageType === 'pin_share' && msg.pinIds.map(pinId => {
          const pin = pins.get(pinId);
          if (!pin) return (
            <View key={pinId} style={[styles.pinCard, { backgroundColor: isMe ? colors.homeSurface + '24' : colors.homeAqua }]}>
              <Text style={{ color: isMe ? colors.homeSurface : colors.homeInk }}>Shared pin</Text>
            </View>
          );
          const forTrade = msg.forTradePinIds.includes(pinId);
          return (
            <TouchableOpacity key={pinId} accessibilityRole="button" accessibilityLabel={`${pin.title}${forTrade ? ', for trade' : ''}`} onPress={() => router.push({ pathname: '/pin/[id]' as any, params: { id: pinId } })} style={[styles.pinCard, { backgroundColor: isMe ? colors.homeSurface + '24' : colors.homeAqua }]} activeOpacity={0.8}>
              <PinImage source={getPinImageSource(pin)} style={styles.pinImage} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={[styles.pinTitle, { color: isMe ? colors.homeSurface : colors.homeInk }]}>{pin.title}</Text>
                {forTrade && <Text style={[styles.tradeTag, { color: isMe ? colors.homeSurface : colors.homeCoral }]}>FOR TRADE</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
        {msg.messageType === 'text' && !!msg.body.trim() && (
          <Text style={[styles.bubbleText, { color: isMe ? colors.homeSurface : colors.homeInk }]}>
            {previewBody(msg)}
          </Text>
        )}
        <Text style={[styles.bubbleTime, { color: isMe ? colors.homeSurface + '99' : colors.homeMuted }]}>
          {new Date(msg.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Bubble>
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors(); const insets = useSafeAreaInsets();
  const { repo, userId } = useCommunity(); const { markRead } = useUnreadMessages();
  const { collection } = useCollection(); const { pins, ensurePins } = usePinCatalogue();
  const seenIdsRef = useRef<Set<string>>(new Set()); const isFocusedRef = useRef(false);
  const pendingReadRef = useRef(false); const listRef = useRef<FlatList<ConversationMessage>>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [contextPost, setContextPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<UserError | null>(null);
  const [msgText, setMsgText] = useState(''); const [sending, setSending] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [photoPickerPending, setPhotoPickerPending] = useState(false);
  const [tradeConfirmOpen, setTradeConfirmOpen] = useState(false);
  const [pinPickerOpen, setPinPickerOpen] = useState(false); const [selectedPinIds, setSelectedPinIds] = useState<string[]>([]);
  const [pinSearch, setPinSearch] = useState('');
  // Report / Block from a message (B-P0-05b, #17).
  const { isBlocked, canModerate, unblock } = useBlockedUsers();
  const toast = useToast();
  const [safetyMessageId, setSafetyMessageId] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState(false);

  const pinMap = useMemo(() => new Map(pins.map(pin => [pin.id, pin])), [pins]);
  const newestFirst = useMemo(() => chatListData(messages), [messages]);
  const shareablePins = useMemo(() => Object.values(collection)
    .filter(entry => entry.status === 'for_trade' || entry.status === 'owned')
    .sort((a, b) => Number(b.status === 'for_trade') - Number(a.status === 'for_trade'))
    .map(entry => pinMap.get(entry.pinId))
    .filter((pin): pin is CataloguePin => Boolean(pin))
    .filter(pin => {
      const term = pinSearch.trim().toLowerCase();
      return !term || [pin.title, pin.collection, pin.brand, ...pin.characters]
        .some(value => value.toLowerCase().includes(term));
    }), [collection, pinMap, pinSearch]);

  useEffect(() => { void ensurePins(Object.keys(collection)); }, [collection, ensurePins]);
  useEffect(() => { void ensurePins(messages.flatMap(message => message.pinIds)); }, [messages, ensurePins]);

  const load = useCallback(async (isInitial = false) => {
    if (!repo || !userId || !id) { setLoading(false); return; }
    try {
      if (isInitial) setLoading(true);
      const c = await repo.getConversation(id, userId);
      const msgs = await repo.getConversationMessages(id);
      setConv(c);
      if (isInitial) {
        if (c?.contextPostId) setContextPost(await repo.getCommunityPost(c.contextPostId));
      }
      const hasNew = isInitial || msgs.some(m => m.senderId !== userId && !seenIdsRef.current.has(m.id));
      seenIdsRef.current = new Set(msgs.map(m => m.id)); setMessages(msgs);
      if (hasNew) { if (isFocusedRef.current) markRead(id); else pendingReadRef.current = true; }
    } catch (e) { setError(toUserError(e, 'chat')); }
    finally { setLoading(false); }
  }, [repo, userId, id, markRead]);
  useEffect(() => { load(true); }, [repo, userId, id]);
  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    if (pendingReadRef.current && id) { pendingReadRef.current = false; markRead(id); }
    return () => { isFocusedRef.current = false; };
  }, [id, markRead]));
  useEffect(() => { const timer = setInterval(() => load(false), 8_000); return () => clearInterval(timer); }, [load]);

  const send = async (
    body: string,
    options?: {
      messageType: 'pin_share' | 'photo';
      pinIds?: string[];
      forTradePinIds?: string[];
      photoUrls?: string[];
    },
  ) => {
    if (!repo || !userId || !id) return;
    try {
      setSending(true);
      const msg = await repo.sendConversationMessage(id, userId, body, options);
      setMessages(prev => [...prev, msg]);
      setMsgText('');
      // Offset 0 is the newest end of the inverted list.
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      Alert.alert("Message not sent", userErrorLine(e, 'chat-send'));
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    if (msgText.trim()) void send(msgText.trim());
  };

  const choosePhoto = async () => {
    if (!userId) return;
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photo permission needed', 'Allow access to select photos.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 1,
      });
      if (result.canceled) return;
      setSending(true);
      const urls = await Promise.all(
        result.assets.map((asset, index) => uploadCommunityPhoto(userId, asset.uri, index)),
      );
      await send('', { messageType: 'photo', photoUrls: urls });
    } catch (e) {
      Alert.alert('Photo not sent', userErrorLine(e, 'chat-photo'));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android' || attachmentMenuOpen || !photoPickerPending) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setPhotoPickerPending(false);
        void choosePhoto();
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [attachmentMenuOpen, photoPickerPending, userId]);

  const closeAttachmentMenu = () => {
    setPhotoPickerPending(false);
    setAttachmentMenuOpen(false);
  };

  const openPhotoPicker = () => {
    setAttachmentMenuOpen(false);
    if (Platform.OS === 'web') {
      // Web requires the file input to open directly from the user's click.
      void choosePhoto();
    } else {
      // Native pickers cannot reliably present while the RN Modal is dismissing.
      setPhotoPickerPending(true);
    }
  };

  const sharePins = () => {
    if (!selectedPinIds.length) return;
    setPinPickerOpen(false);
    void send('', {
      messageType: 'pin_share',
      pinIds: selectedPinIds,
      forTradePinIds: selectedPinIds.filter(pinId => collection[pinId]?.status === 'for_trade'),
    });
    setSelectedPinIds([]);
  };
  const tradeRelated = contextPost?.postType === 'for_trade' || Boolean(conv?.tradeId);
  const agreeTrade = async () => {
    if (!repo || !userId || !conv) return;
    try {
      setSending(true);
      const existing = conv.tradeId;
      const trade = existing
        ? await repo.updateTradeStatus(existing, 'accepted')
        : await repo.createTrade(
          userId,
          conv.otherParticipant?.id ?? (
            conv.participantAId === userId ? conv.participantBId : conv.participantAId
          ),
        );
      const accepted = trade.status === 'accepted'
        ? trade
        : await repo.updateTradeStatus(trade.id, 'accepted');
      if (!existing) await repo.linkConversationTrade(conv.id, accepted.id);
      setConv(current => current ? { ...current, tradeId: accepted.id } : current);
      setTradeConfirmOpen(false);
    } catch (e) {
      Alert.alert('Trade not marked agreed', userErrorLine(e, 'chat-agree'));
    } finally {
      setSending(false);
    }
  };
  const otherName = conv?.otherParticipant?.username ? `@${conv.otherParticipant.username}` : 'Conversation';
  const otherId = conv ? otherParticipantId(conv, userId) : undefined;
  const otherBlocked = isBlocked(otherId);
  const handleUnblock = async () => {
    if (!otherId) return;
    setUnblocking(true);
    try {
      await unblock(otherId);
      toast.show({ message: `Unblocked ${otherName}` });
    } catch (e) {
      toast.show({ message: userErrorLine(e, 'block') });
    } finally {
      setUnblocking(false);
    }
  };
  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 8;

  return (
    <>
      <Stack.Screen options={{ title: otherName }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.homeCoral} /></View>
        ) : error ? (
          <View style={styles.center}>
            <ErrorState error={error} onRetry={() => { setError(null); load(true); }} />
          </View>
        ) : otherBlocked ? (
          // Blocked: their messages are hidden and nothing can be sent.
          <View testID="chat-blocked" style={[styles.center, styles.blockedWrap]}>
            <Feather name="slash" size={32} color={colors.homeMuted} />
            <Text accessibilityRole="header" style={[styles.blockedTitle, { color: colors.homeInk }]}>You blocked {otherName}</Text>
            <Text style={[styles.blockedText, { color: colors.homeMuted }]}>
              This conversation is hidden. Neither of you can send messages while they're blocked.
            </Text>
            <Button
              label="Unblock"
              variant="secondary"
              size="compact"
              fullWidth={false}
              loading={unblocking}
              onPress={() => { void handleUnblock(); }}
              accessibilityLabel={`Unblock ${otherName}`}
            />
          </View>
        ) : (
          <>
            {/* Inverted list (UX-052, #160): only what's on screen renders, the
                newest message sits at the bottom without scrollToEnd, and new
                or older content doesn't make the view jump. The context banner
                and trade card head the conversation, so they're the footer
                (the top of an inverted list). */}
            <FlatList
              ref={listRef}
              testID="chat-messages"
              inverted
              data={newestFirst}
              keyExtractor={msg => msg.id}
              renderItem={({ item }) => (
                <MessageBubble
                  msg={item}
                  isMe={item.senderId === userId}
                  colors={colors}
                  pins={pinMap}
                  onLongPress={canModerate && otherId ? m => setSafetyMessageId(m.id) : undefined}
                />
              )}
              ItemSeparatorComponent={MessageGap}
              ListFooterComponent={
                <View style={styles.listTop}>
                  {contextPost && (
                    <View style={[styles.contextBanner, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
                      <Feather name="link" size={14} color={colors.homeMuted} />
                      <Text numberOfLines={2} style={[styles.contextText, { color: colors.homeMuted }]}>
                        From post: {contextPost.body}
                      </Text>
                    </View>
                  )}
                  {tradeRelated && (conv?.tradeId ? (
                    <View style={[styles.agreedCard, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
                      <Text style={[styles.agreedTitle, { color: colors.homeInk }]}>Trade agreed ✓</Text>
                      <Text style={[styles.contextText, { color: colors.homeMuted }]}>Each of you posts your own pins. Use a tracked service.</Text>
                      <TouchableOpacity onPress={() => router.push('/trading-safely')} accessibilityRole="link" accessibilityLabel="Trading safely guide" hitSlop={{ top: 10, bottom: 10 }} style={styles.safelyLink}>
                        <Feather name="shield" size={13} color={colors.homeCoral} />
                        <Text style={[styles.safelyText, { color: colors.homeCoral }]}>Trading safely</Text>
                        <Feather name="chevron-right" size={13} color={colors.homeCoral} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity accessibilityRole="button" onPress={() => setTradeConfirmOpen(true)} style={[styles.agreeButton, { borderColor: colors.homeCoral }]}>
                      <Feather name="check-circle" size={16} color={colors.homeCoral} />
                      <Text style={[styles.agreeText, { color: colors.homeCoral }]}>Mark Trade Agreed</Text>
                    </TouchableOpacity>
                  ))}
                  {messages.length === 0 && (
                    <View style={styles.emptyMessages}>
                      <Text style={[styles.emptyMsgText, { color: colors.homeMuted }]}>
                        No messages yet. Say hello!
                      </Text>
                    </View>
                  )}
                </View>
              }
              style={styles.messageList}
              contentContainerStyle={{ padding: spacing.lg }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={15}
              windowSize={11}
              // Reading older messages: a new one arriving doesn't move them;
              // near the newest, the list follows it down.
              maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 80 }}
            />
            <View style={[styles.inputBar, {
              borderTopColor: colors.homeLine,
              backgroundColor: colors.homeBackground,
              paddingBottom: botPad,
            }]}>
              <TouchableOpacity
                onPress={() => setAttachmentMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add a photo or pins"
                style={[styles.plusBtn, { backgroundColor: colors.homeAqua }]}
              >
                <Feather name="plus" size={21} color={colors.homeInk} />
              </TouchableOpacity>
              <TextInput
                value={msgText}
                onChangeText={setMsgText}
                placeholder="Type a message…"
                placeholderTextColor={colors.homeMuted}
                style={[styles.msgInput, {
                  color: colors.homeInk,
                  borderColor: colors.homeLine,
                  backgroundColor: colors.homeAqua,
                }]}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!msgText.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !msgText.trim() || sending, busy: sending }}
                style={[styles.sendBtn, {
                  backgroundColor: msgText.trim() ? colors.homeCoral : colors.homeAqua,
                }]}
              >
                {sending ? <ActivityIndicator color={colors.homeSurface} size="small" /> : (
                  <Feather name="send" size={16} color={msgText.trim() ? colors.homeSurface : colors.homeMuted} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
      {otherId && (
        <UserSafetySheet
          visible={safetyMessageId !== null}
          onClose={() => setSafetyMessageId(null)}
          target={{ id: otherId, username: conv?.otherParticipant?.username, avatarUrl: conv?.otherParticipant?.avatarUrl }}
          messageId={safetyMessageId ?? undefined}
        />
      )}
      <Modal
        visible={tradeConfirmOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setTradeConfirmOpen(false)}
      >
        <View style={[styles.confirmShade]}>
          <View style={[styles.confirmCard, { backgroundColor: colors.homeBackground }]}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.homeAqua }]}>
              <Feather name="check-circle" size={28} color={colors.homeCoral} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.homeInk }]}>Mark trade agreed?</Text>
            <Text style={[styles.confirmBody, { color: colors.homeMuted }]}>
              This records the agreement for trade history. You can arrange delivery together when ready.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                disabled={sending}
                onPress={() => setTradeConfirmOpen(false)}
                accessibilityRole="button"
                style={[styles.confirmButton, { backgroundColor: colors.homeAqua }]}
              >
                <Text style={[styles.confirmButtonText, { color: colors.homeInk }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={sending}
                onPress={() => void agreeTrade()}
                accessibilityRole="button"
                accessibilityLabel="Confirm trade agreed"
                style={[styles.confirmButton, { backgroundColor: colors.homeCoral }]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.homeSurface} />
                ) : (
                  <Text style={[styles.confirmButtonText, { color: colors.homeSurface }]}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={attachmentMenuOpen}
        animationType={Platform.OS === 'android' ? 'none' : 'fade'}
        transparent
        onRequestClose={closeAttachmentMenu}
        onDismiss={() => {
          if (Platform.OS !== 'ios' || !photoPickerPending) return;
          setPhotoPickerPending(false);
          void choosePhoto();
        }}
      >
        <View style={styles.modalShade}>
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={closeAttachmentMenu}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={[styles.attachmentSheet, { backgroundColor: colors.homeBackground }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.homeInk }]}>Add to conversation</Text>
              <TouchableOpacity onPress={closeAttachmentMenu} accessibilityRole="button" accessibilityLabel="Close" hitSlop={11}>
                <Feather name="x" size={22} color={colors.homeInk} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.attachmentOption, { borderColor: colors.homeLine }]}
              onPress={openPhotoPicker}
              accessibilityRole="button"
            >
              <View style={[styles.attachmentIcon, { backgroundColor: colors.homeAqua }]}>
                <Feather name="image" size={20} color={colors.homeCoral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.attachmentTitle, { color: colors.homeInk }]}>Photo</Text>
                <Text style={[styles.attachmentSub, { color: colors.homeMuted }]}>
                  Share photos of your trader board
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.homeMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachmentOption, { borderColor: colors.homeLine }]}
              accessibilityRole="button"
              onPress={() => {
                setAttachmentMenuOpen(false);
                setPinPickerOpen(true);
              }}
            >
              <View style={[styles.attachmentIcon, { backgroundColor: colors.homeAqua }]}>
                <Feather name="plus-square" size={20} color={colors.homeCoral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.attachmentTitle, { color: colors.homeInk }]}>Add Pin</Text>
                <Text style={[styles.attachmentSub, { color: colors.homeMuted }]}>
                  Choose from your PinHunt collection
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.homeMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={pinPickerOpen} animationType="slide" transparent onRequestClose={() => setPinPickerOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.pinPicker, { backgroundColor: colors.homeBackground }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.homeInk }]}>Share pins</Text>
              <TouchableOpacity onPress={() => setPinPickerOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={11}>
                <Feather name="x" size={22} color={colors.homeInk} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={pinSearch}
              onChangeText={setPinSearch}
              placeholder="Search your collection"
              placeholderTextColor={colors.homeMuted}
              style={[styles.pinSearch, { color: colors.homeInk, borderColor: colors.homeLine }]}
            />
            <ScrollView>
              {shareablePins.map(pin => {
                const selected = selectedPinIds.includes(pin.id);
                return (
                  <TouchableOpacity
                    key={pin.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setSelectedPinIds(current => selected
                      ? current.filter(x => x !== pin.id)
                      : [...current, pin.id])}
                    style={[styles.pickerRow, { borderBottomColor: colors.homeLine }]}
                  >
                    <PinImage source={getPinImageSource(pin)} style={styles.pickerImage} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pinTitle, { color: colors.homeInk }]}>{pin.title}</Text>
                      {collection[pin.id]?.status === 'for_trade' && <Text style={[styles.tradeTag, { color: colors.homeCoral }]}>FOR TRADE</Text>}
                    </View>
                    <Feather name={selected ? 'check-square' : 'square'} size={21} color={selected ? colors.homeCoral : colors.homeMuted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              disabled={!selectedPinIds.length}
              onPress={sharePins}
              accessibilityRole="button"
              accessibilityState={{ disabled: !selectedPinIds.length }}
              style={[styles.shareButton, {
                backgroundColor: selectedPinIds.length ? colors.homeCoral : colors.homeAqua,
              }]}
            >
              <Text style={[styles.shareLabel, { color: colors.homeSurface }]}>
                Share {selectedPinIds.length || ''} Pin{selectedPinIds.length === 1 ? '' : 's'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, messageList: { flex: 1 }, messageGap: { height: spacing.sm }, listTop: { gap: spacing.sm, paddingBottom: spacing.sm }, emptyMessages: { alignItems: 'center', paddingVertical: 40 }, emptyMsgText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  contextBanner: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm + 2, borderWidth: 1, borderRadius: radius.sm }, contextText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 }, agreedCard: { padding: spacing.md - 1, borderWidth: 1, borderRadius: radius.sm, gap: 3 }, agreedTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, agreeButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, padding: spacing.md - 1, borderWidth: 1, borderRadius: radius.sm }, agreeText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  bubbleRow: { flexDirection: 'row' }, bubbleRowMe: { justifyContent: 'flex-end' }, bubble: { maxWidth: '78%', padding: spacing.sm + 2, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs + 2 }, bubbleMe: { borderWidth: 0 }, bubbleText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 19 }, bubbleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right' }, photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, sharedPhoto: { width: 118, height: 118, borderRadius: radius.sm - 2 }, pinCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 7, borderRadius: radius.sm - 1 }, pinImage: { width: 44, height: 44, borderRadius: 6 }, pinTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, tradeTag: { marginTop: 2, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: .5 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, borderTopWidth: StyleSheet.hairlineWidth }, plusBtn: { width: 40, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, msgInput: { flex: 1, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, fontSize: 14, fontFamily: 'Inter_400Regular', maxHeight: 120, borderWidth: 1, borderRadius: 22 }, sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  attachmentSheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm + 2 },
  attachmentOption: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm + 2, flexDirection: 'row', alignItems: 'center', gap: 11 },
  attachmentIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  attachmentTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  attachmentSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  confirmShade: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: spacing.xxl },
  confirmCard: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.sm + 2 },
  confirmIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmBody: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', gap: spacing.sm + 2, alignSelf: 'stretch', marginTop: spacing.xs + 2 },
  confirmButton: { flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  confirmButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.45)' }, pinPicker: { maxHeight: '78%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm + 2 }, pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, pickerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' }, pinSearch: { borderWidth: 1, borderRadius: radius.sm - 1, paddingHorizontal: 11, paddingVertical: spacing.sm + 1, fontSize: 14, fontFamily: 'Inter_400Regular' }, pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth }, pickerImage: { width: 48, height: 48, borderRadius: 7 }, shareButton: { alignItems: 'center', padding: spacing.md + 1, borderRadius: radius.sm }, shareLabel: { fontFamily: 'Inter_600SemiBold' },
  safelyLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
  safelyText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  blockedWrap: { padding: spacing.xxl, gap: spacing.md },
  blockedTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  blockedText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, textAlign: 'center', maxWidth: 300 },
});
