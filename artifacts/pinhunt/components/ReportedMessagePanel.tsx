/**
 * The reported message on a moderation report card (#504), and the Remove
 * action (#524). Migration 072.
 *
 * The message loads only when the moderator taps "Show message": each view
 * is recorded, so the queue opening doesn't count as reading every report.
 * Only that one message is shown, never the conversation.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { IUserPinRepository, ReportedMessageView } from '@workspace/pin-repository';
import { MESSAGE_REMOVAL_REASON_MAX } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/utils/format';
import { isValidRemovalReason, requestMessageRemoval } from '@/utils/removeReportedMessage';

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; view: ReportedMessageView };

export function ReportedMessagePanel({
  reportId,
  messageId,
  repo,
}: {
  reportId: string;
  messageId: string;
  repo: Pick<IUserPinRepository, 'getReportedMessage'>;
}) {
  const colors = useColors();
  const { session } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      setPhase({ kind: 'loaded', view: await repo.getReportedMessage(reportId) });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Could not load the reported message.' });
    }
  }, [repo, reportId]);

  const remove = useCallback(async () => {
    setRemoving(true);
    setRemoveError(null);
    const outcome = await requestMessageRemoval(session?.access_token, messageId, reason);
    setRemoving(false);
    if (!outcome.ok) {
      setRemoveError(outcome.message);
      return;
    }
    setConfirming(false);
    setReason('');
    // Reload so the card shows exactly what the database now holds.
    await load();
  }, [session?.access_token, messageId, reason, load]);

  if (phase.kind === 'idle' || phase.kind === 'error') {
    return (
      <View style={{ gap: 6 }}>
        {phase.kind === 'error' && (
          <Text style={[styles.note, { color: colors.destructive }]}>{phase.message}</Text>
        )}
        <TouchableOpacity
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Show the reported message"
          accessibilityHint="Moderators' views are recorded"
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={styles.showBtn}
          testID={`show-reported-message-${reportId}`}
        >
          <Feather name="eye" size={12} color={colors.homeCoralDeep} />
          <Text style={[styles.note, { color: colors.homeCoralDeep, fontFamily: 'Inter_600SemiBold' }]}>
            {phase.kind === 'error' ? 'Try again' : 'Show message'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase.kind === 'loading') {
    return <ActivityIndicator size="small" color={colors.homeCoral} style={{ alignSelf: 'flex-start' }} />;
  }

  const { view } = phase;
  if (view.status === 'gone' || !view.message) {
    return (
      <View style={[styles.box, { borderColor: colors.homeLine }]} testID="reported-message-gone">
        <Text style={[styles.note, { color: colors.homeMuted }]}>
          This message is no longer available. The report may have been dismissed, or the message deleted.
        </Text>
      </View>
    );
  }

  const msg = view.message;
  if (view.status === 'removed') {
    return (
      <View style={[styles.box, { borderColor: colors.homeLine, borderStyle: 'dashed' }]} testID="reported-message-removed">
        <View style={styles.row}>
          <Feather name="slash" size={12} color={colors.homeMuted} />
          <Text style={[styles.note, { color: colors.homeMuted, fontFamily: 'Inter_600SemiBold' }]}>Removed by moderators</Text>
        </View>
        {view.removal ? (
          <Text style={[styles.note, { color: colors.homeMuted }]}>
            {formatDate(view.removal.createdAt, 'medium')}{view.removal.reason ? ` · ${view.removal.reason}` : ''}
          </Text>
        ) : null}
      </View>
    );
  }

  const tooLong = reason.trim().length > MESSAGE_REMOVAL_REASON_MAX;
  return (
    <View style={{ gap: 8 }} testID="reported-message">
      <View style={[styles.box, { borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}>
        <Text style={[styles.note, { color: colors.homeMuted }]}>Sent {formatDate(msg.createdAt, 'medium')}</Text>
        {msg.body.trim() ? (
          <Text style={[styles.body, { color: colors.homeInk }]} selectable>{msg.body}</Text>
        ) : null}
        {msg.photoUrls.length > 0 && (
          <View style={styles.photos}>
            {msg.photoUrls.map((url, i) => (
              <Image
                key={`${url}-${i}`}
                source={{ uri: url }}
                accessibilityLabel={`Reported photo ${i + 1} of ${msg.photoUrls.length}`}
                style={[styles.photo, { backgroundColor: colors.homeLine }]}
              />
            ))}
          </View>
        )}
        {msg.pinIds.length > 0 && (
          <Text style={[styles.note, { color: colors.homeMuted }]} selectable>
            Shared pins: {msg.pinIds.join(', ')}
          </Text>
        )}
      </View>

      {confirming ? (
        <View style={[styles.confirm, { backgroundColor: colors.homeAqua }]}>
          <TextInput
            value={reason}
            onChangeText={t => setReason(t.slice(0, MESSAGE_REMOVAL_REASON_MAX))}
            placeholder="Reason (required, for admins only)"
            placeholderTextColor={colors.homeMuted}
            multiline
            maxLength={MESSAGE_REMOVAL_REASON_MAX}
            accessibilityLabel="Reason for removing the message"
            style={[styles.input, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
          />
          <Text style={[styles.count, { color: colors.homeMuted }]}>{reason.length}/{MESSAGE_REMOVAL_REASON_MAX}</Text>
          <Text style={[styles.confirmText, { color: colors.homeInk }]}>
            Remove this message? Both people will see “Removed by PinHunt moderators”. Its photos are deleted. The report and the rest of the conversation stay.
          </Text>
          {removeError && <Text style={[styles.note, { color: colors.destructive }]}>{removeError}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity
              onPress={() => { setConfirming(false); setRemoveError(null); setReason(''); }}
              disabled={removing}
              style={styles.btn}
            >
              <Text style={[styles.btnLabel, { color: colors.homeMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={remove}
              disabled={removing || !isValidRemovalReason(reason) || tooLong}
              accessibilityRole="button"
              accessibilityLabel="Confirm remove message"
              accessibilityState={{ disabled: removing || !isValidRemovalReason(reason) }}
              style={[styles.btn, { backgroundColor: colors.destructive, opacity: isValidRemovalReason(reason) ? 1 : 0.5 }]}
            >
              {removing
                ? <ActivityIndicator size="small" color={colors.homeHeroText} />
                : <Text style={[styles.btnLabel, { color: colors.homeHeroText }]}>Remove</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => { setRemoveError(null); setConfirming(true); }}
          accessibilityRole="button"
          accessibilityLabel="Remove this message"
          activeOpacity={0.85}
          style={[styles.removeBtn, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather name="trash-2" size={13} color={colors.destructive} />
          <Text style={[styles.btnLabel, { color: colors.destructive, fontSize: 12 }]}>Remove message</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  showBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note:       { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  box:        { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  body:       { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  photos:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo:      { width: 96, height: 96, borderRadius: 8 },
  confirm:    { borderRadius: 12, padding: 12, gap: 8 },
  confirmText:{ fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  input:      { borderWidth: 1, borderRadius: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  count:      { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -4 },
  buttons:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn:        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, minWidth: 84, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  btnLabel:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  removeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 8, alignSelf: 'flex-start', minHeight: 32 },
});
