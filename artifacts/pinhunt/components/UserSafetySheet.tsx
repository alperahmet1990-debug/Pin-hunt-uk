/**
 * UserSafetySheet (B-P0-05b, #17): Report and Block for a collector or one
 * of their messages, opened from a profile's "More options" button or by
 * long-pressing a message. One sheet whose content steps from the menu to
 * the report form or the block confirmation, so no second modal is stacked
 * on the first (memory: expo-native-picker-presentation) and no native
 * Alert callback is relied on (memory: expo-web-action-confirmations).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useBlockedUsers, type BlockTarget } from '@/context/BlockedUsersContext';
import {
  USER_REPORT_REASONS,
  USER_REPORT_REASON_MAX,
  buildReportReason,
  type UserReportReason,
} from '@/utils/blockedUsers';
import { userErrorLine } from '@/utils/userError';

type Step = 'menu' | 'report' | 'block';

export interface UserSafetySheetProps {
  visible: boolean;
  onClose: () => void;
  target: BlockTarget;
  /** Set when opened from a message: Report then reports that message. */
  messageId?: string;
  /** Called after a successful block (e.g. leave the conversation). */
  onBlocked?: () => void;
}

const DETAILS_MAX = 300;

export function UserSafetySheet({ visible, onClose, target, messageId, onBlocked }: UserSafetySheetProps) {
  const colors = useColors();
  const toast = useToast();
  const { isBlocked, block, unblock, report } = useBlockedUsers();
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every opening starts at the menu with a clean form.
  useEffect(() => {
    if (!visible) return;
    setStep('menu');
    setReason(null);
    setDetails('');
    setBusy(false);
    setError(null);
  }, [visible]);

  const handle = target.username ? `@${target.username}` : 'this collector';
  const blocked = isBlocked(target.id);

  const goTo = (next: Step) => { setError(null); setStep(next); };

  const sendReport = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await report({ reportedUserId: target.id, messageId, reason: buildReportReason(reason, details) });
      onClose();
      toast.show({ message: 'Report sent. Thanks, our team will review it.' });
    } catch (e) {
      setError(userErrorLine(e, 'report'));
    } finally {
      setBusy(false);
    }
  };

  const confirmBlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await block(target);
      onClose();
      toast.show({
        message: `Blocked ${handle}`,
        action: { label: 'Undo', onPress: () => { void unblock(target.id).catch(() => {}); } },
      });
      onBlocked?.();
    } catch (e) {
      setError(userErrorLine(e, 'block'));
    } finally {
      setBusy(false);
    }
  };

  const doUnblock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unblock(target.id);
      onClose();
      toast.show({ message: `Unblocked ${handle}` });
    } catch (e) {
      setError(userErrorLine(e, 'block'));
    } finally {
      setBusy(false);
    }
  };

  const title = step === 'report'
    ? (messageId ? 'Report message' : `Report ${handle}`)
    : step === 'block' ? `Block ${handle}?` : handle;

  const footer = step === 'report' ? (
    <Button
      label="Send report"
      icon="flag"
      onPress={() => { void sendReport(); }}
      disabled={!reason}
      loading={busy}
      testID="safety-send-report"
    />
  ) : step === 'block' ? (
    <View style={styles.footerStack}>
      <Button
        label={`Block ${handle}`}
        icon="slash"
        variant="destructive"
        onPress={() => { void confirmBlock(); }}
        loading={busy}
        testID="safety-confirm-block"
      />
      <Button label="Cancel" variant="secondary" onPress={() => goTo('menu')} disabled={busy} />
    </View>
  ) : undefined;

  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={footer}>
      {step === 'menu' && (
        <View style={styles.menu}>
          <MenuRow
            icon="flag"
            label={messageId ? 'Report message' : `Report ${handle}`}
            detail={messageId ? 'Our team will see this message' : 'Tell our team about a problem'}
            onPress={() => goTo('report')}
          />
          {blocked ? (
            <MenuRow
              icon="user-check"
              label={`Unblock ${handle}`}
              detail="See their posts and messages again"
              onPress={() => { void doUnblock(); }}
              disabled={busy}
            />
          ) : (
            <MenuRow
              icon="slash"
              label={`Block ${handle}`}
              detail="Stop messages and trades between you"
              destructive
              onPress={() => goTo('block')}
            />
          )}
        </View>
      )}

      {step === 'report' && (
        <View style={styles.form}>
          <Text style={[styles.lead, { color: colors.homeMuted }]}>
            {messageId
              ? `What's wrong with this message from ${handle}?`
              : `What's the problem with ${handle}?`}{' '}
            They won't be told who reported them.
          </Text>
          <View accessibilityRole="radiogroup" style={styles.reasons}>
            {USER_REPORT_REASONS.map(r => {
              const selected = reason === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setReason(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={r}
                  activeOpacity={0.8}
                  style={[
                    styles.reason,
                    {
                      borderColor: selected ? colors.homeCoral : colors.homeLine,
                      backgroundColor: selected ? colors.homeAqua : colors.homeSurface,
                    },
                  ]}
                >
                  <Feather
                    name={selected ? 'check-circle' : 'circle'}
                    size={18}
                    color={selected ? colors.homeCoralDeep : colors.homeMuted}
                  />
                  <Text style={[styles.reasonLabel, { color: colors.homeInk }]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add details (optional)"
            placeholderTextColor={colors.homeMuted}
            accessibilityLabel="Report details, optional"
            multiline
            maxLength={Math.min(DETAILS_MAX, USER_REPORT_REASON_MAX)}
            style={[styles.details, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
          />
        </View>
      )}

      {step === 'block' && (
        <View style={styles.form}>
          <BlockPoint icon="message-circle" text="Neither of you can message the other or propose a trade." />
          <BlockPoint icon="eye-off" text="Their posts, comments, conversations and trade matches are hidden from you." />
          <BlockPoint icon="bell-off" text="They aren't told. You can unblock them any time in Profile, Blocked users." />
        </View>
      )}

      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </Sheet>
  );
}

function MenuRow({ icon, label, detail, onPress, destructive, disabled }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  detail: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const fg = destructive ? colors.destructive : colors.homeInk;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      activeOpacity={0.8}
      style={[styles.menuRow, { borderColor: colors.homeLine }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: destructive ? colors.destructive + '18' : colors.homeAqua }]}>
        <Feather name={icon} size={18} color={fg} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuLabel, { color: fg }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.menuDetail, { color: colors.homeMuted }]}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

function BlockPoint({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.point}>
      <Feather name={icon} size={16} color={colors.homeMuted} style={styles.pointIcon} />
      <Text style={[styles.pointText, { color: colors.homeInk }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { gap: spacing.sm, paddingBottom: spacing.sm },
  menuRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  menuIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, minWidth: 0, gap: 2 },
  menuLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  menuDetail: { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  form: { gap: spacing.md, paddingBottom: spacing.sm },
  lead: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  reasons: { gap: spacing.sm },
  reason: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  reasonLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  details: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  point: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start' },
  pointIcon: { marginTop: 2 },
  pointText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  footerStack: { gap: spacing.sm },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: spacing.sm, paddingBottom: spacing.sm },
});
