import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { PINS } from '@/mock-data/pins';
import type { CollectionStatus } from '@/types/pin';

const STATUS_CONFIG: Array<{ status: CollectionStatus; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { status: 'owned', label: 'Owned', icon: 'check-circle' },
  { status: 'wanted', label: 'ISO', icon: 'bookmark' },
  { status: 'for_trade', label: 'For Trade', icon: 'repeat' },
];

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry, setStatus, setNotes, markViewed } = useCollection();

  const pin = PINS.find(p => p.id === id);
  const entry = pin ? getEntry(pin.id) : undefined;
  const [notesText, setNotesText] = useState(entry?.notes ?? '');
  const [showBack, setShowBack] = useState(false);
  const notesSaved = useRef(false);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  useEffect(() => {
    if (pin) markViewed(pin.id);
  }, [pin?.id]);

  // Save notes on unmount
  useEffect(() => {
    return () => {
      if (pin && !notesSaved.current) {
        setNotes(pin.id, notesText);
      }
    };
  }, [notesText, pin?.id]);

  if (!pin) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundText, { color: colors.foreground }]}>Pin not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStatus = entry?.status ?? 'none';

  const handleStatusPress = (s: CollectionStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus(pin.id, currentStatus === s ? 'none' : s);
  };

  const handleSaveNotes = () => {
    setNotes(pin.id, notesText);
    notesSaved.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const statusColor = (s: CollectionStatus) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  return (
    <>
      <Stack.Screen options={{ title: pin.title }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: botPad }}
      >
        {/* Image */}
        <View style={styles.imageWrap}>
          <Image
            source={showBack && pin.backImage ? pin.backImage : pin.image}
            style={styles.mainImage}
          />
          {pin.backImage && (
            <TouchableOpacity
              onPress={() => setShowBack(b => !b)}
              style={[styles.flipBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Feather name="refresh-cw" size={14} color={colors.foreground} />
              <Text style={[styles.flipLabel, { color: colors.foreground }]}>
                {showBack ? 'Front' : 'Back'}
              </Text>
            </TouchableOpacity>
          )}
          {pin.limitedEditionSize && (
            <View style={[styles.leBadge, { backgroundColor: colors.gold }]}>
              <Text style={styles.leLabel}>LE {pin.limitedEditionSize.toLocaleString()}</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Title & Brand */}
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>{pin.title}</Text>
              <View style={[styles.brandChip, { backgroundColor: colors.accent }]}>
                <Text style={styles.brandChipLabel}>{pin.brand}</Text>
              </View>
            </View>
            {pin.isNewRelease && (
              <View style={[styles.newChip, { backgroundColor: colors.primary }]}>
                <Text style={styles.newChipLabel}>NEW</Text>
              </View>
            )}
          </View>

          {/* Status Buttons */}
          <View style={styles.statusRow}>
            {STATUS_CONFIG.map(cfg => {
              const isActive = currentStatus === cfg.status;
              const bg = isActive ? statusColor(cfg.status) : colors.secondary;
              const fg = isActive ? '#fff' : colors.mutedForeground;
              return (
                <TouchableOpacity
                  key={cfg.status}
                  onPress={() => handleStatusPress(cfg.status)}
                  activeOpacity={0.8}
                  style={[
                    styles.statusBtn,
                    { backgroundColor: bg, borderRadius: colors.radius - 2, borderColor: isActive ? 'transparent' : colors.border },
                  ]}
                >
                  <Feather name={cfg.icon} size={16} color={fg} />
                  <Text style={[styles.statusBtnLabel, { color: fg }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Metadata */}
          <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <MetaRow label="Collection" value={pin.collection} colors={colors} />
            {pin.characters.length > 0 && (
              <MetaRow label="Characters" value={pin.characters.join(', ')} colors={colors} />
            )}
            <MetaRow label="Release Date" value={formatDate(pin.releaseDate)} colors={colors} />
            <MetaRow label="Retail Price" value={`£${pin.retailPrice.toFixed(2)}`} colors={colors} />
            {pin.limitedEditionSize && (
              <MetaRow label="Edition Size" value={pin.limitedEditionSize.toLocaleString()} colors={colors} />
            )}
          </View>

          {/* Mock UK Value */}
          <View style={[styles.valueCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.valueRow}>
              <View>
                <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>UK Estimated Value</Text>
                <Text style={[styles.valueAmount, { color: colors.gold }]}>
                  £{pin.estimatedValueGBP.toFixed(0)}
                </Text>
              </View>
              <View style={[styles.sampleBadge, { backgroundColor: colors.muted, borderRadius: 6 }]}>
                <Text style={[styles.sampleLabel, { color: colors.mutedForeground }]}>Sample Data</Text>
              </View>
            </View>
            <Text style={[styles.valueDisclaimer, { color: colors.mutedForeground }]}>
              This is a sample estimated value and does not reflect real market prices. Always check current listings before trading.
            </Text>
          </View>

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={[styles.descTitle, { color: colors.foreground }]}>About this Pin</Text>
            <Text style={[styles.descText, { color: colors.mutedForeground }]}>{pin.description}</Text>
          </View>

          {/* Notes */}
          <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.notesTitle, { color: colors.foreground }]}>My Notes</Text>
            <TextInput
              value={notesText}
              onChangeText={setNotesText}
              multiline
              placeholder="Add your own notes here…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <TouchableOpacity
              onPress={handleSaveNotes}
              style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius - 4 }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>Save Notes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

type ColorsType = ReturnType<typeof import('@/hooks/useColors').useColors>;
function MetaRow({ label, value, colors }: { label: string; value: string; colors: ColorsType }) {
  return (
    <View style={metaStyles.row}>
      <Text style={[metaStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[metaStyles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    gap: 12,
  },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  value: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 2, textAlign: 'right' },
});

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  backLink: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  // Image
  imageWrap: { position: 'relative' },
  mainImage: {
    width: '100%',
    height: 320,
    resizeMode: 'cover',
  },
  flipBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  flipLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  leBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  leLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#1C1C2E' },
  // Content
  content: { padding: 16, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleBlock: { flex: 1, gap: 6 },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', lineHeight: 28 },
  brandChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  brandChipLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  newChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  newChipLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  // Status buttons
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
  },
  statusBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  // Metadata
  metaCard: { borderWidth: 1, overflow: 'hidden' },
  // Value
  valueCard: { borderWidth: 1, padding: 14, gap: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valueLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  valueAmount: { fontSize: 28, fontFamily: 'Inter_700Bold', marginTop: 2 },
  sampleBadge: { paddingHorizontal: 10, paddingVertical: 5 },
  sampleLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  valueDisclaimer: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  // Description
  descSection: { gap: 8 },
  descTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  descText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  // Notes
  notesCard: { borderWidth: 1, padding: 14, gap: 10 },
  notesTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  saveBtn: { alignItems: 'center', paddingVertical: 10 },
  saveBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
