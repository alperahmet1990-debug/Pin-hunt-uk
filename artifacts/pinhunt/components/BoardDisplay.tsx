/**
 * Realistic boards (iPad: Collecting at home): a board's pins laid out large
 * on a corkboard, lanyard, shadow box or plain board, the way collectors
 * display them at home. Tap a pin to open it; on your own boards, Arrange
 * lets you drag pins wherever you like and Tidy up puts them back in rows.
 *
 * Layout maths lives in utils/boardDisplay.ts; the style and arranged
 * positions are saved per board by useBoardDisplay.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import type { CataloguePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useBoardDisplay } from '@/hooks/useBoardDisplay';
import { SegmentedControl } from '@/components/ui';
import { PinImage } from '@/components/ui/PinImage';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import {
  BOARD_ASPECT,
  BOARD_STYLES,
  boardGrid,
  movePlacement,
  pinSizeFraction,
  placementsFor,
  type BoardStyle,
  type PinPlacement,
} from '@/utils/boardDisplay';

// Real-world materials. They look the same in light and dark mode, like the
// physical thing would; the controls around them use the app tokens.
const CORK = { frame: '#6B4F3A', base: '#B48A62', dark: 'rgba(90,60,35,0.38)', light: 'rgba(255,240,220,0.28)' };
const SHADOWBOX = { frame: '#3B2A20', bevel: '#2A1D16' };

const STYLE_OPTIONS = BOARD_STYLES.map(s => ({ ...s, tone: 'coral' as const }));
/** Small phones (320 pt): short labels so none is cut off. */
const SHORT_LABELS: Record<BoardStyle, string> = { cork: 'Cork', lanyard: 'Lanyard', shadowbox: 'Box', plain: 'Plain' };
const SHORT_STYLE_OPTIONS = STYLE_OPTIONS.map(o => ({ ...o, label: SHORT_LABELS[o.value] }));

interface BoardDisplayProps {
  boardId: string;
  pins: CataloguePin[];
  /** Width available for the board. */
  width: number;
  /** Collector-made boards can be arranged; suggested set boards can't. */
  editable: boolean;
  onOpenPin: (pin: CataloguePin) => void;
}

export function BoardDisplay({ boardId, pins, width, editable, onOpenPin }: BoardDisplayProps) {
  const colors = useColors();
  const { prefs, setStyle, setPlacement, tidy } = useBoardDisplay(boardId);
  const [arranging, setArranging] = useState(false);
  const ids = useMemo(() => pins.map(p => p.id), [pins]);
  const placements = useMemo(() => placementsFor(ids, prefs), [ids, prefs]);
  const arrangedByHand = ids.some(id => prefs.placements[id]);

  const style = prefs.style;
  const frame = style === 'cork' ? Math.round(width * 0.025) : style === 'shadowbox' ? Math.round(width * 0.035) : 0;
  const innerW = width - frame * 2;
  const innerH = innerW / BOARD_ASPECT;
  const sizeFraction = pinSizeFraction(ids.length);
  const pinSize = Math.round(sizeFraction * innerW);

  return (
    <View style={styles.wrap}>
      <View style={{ width: Math.min(width, 520) }}>
        <SegmentedControl<BoardStyle> options={width < 340 ? SHORT_STYLE_OPTIONS : STYLE_OPTIONS} value={style} onChange={setStyle} />
      </View>

      <View
        accessibilityLabel={`${BOARD_STYLES.find(s => s.value === style)?.label} with ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'}`}
        style={[styles.board, {
          width,
          padding: frame,
          backgroundColor: style === 'cork' ? CORK.frame : style === 'shadowbox' ? SHADOWBOX.frame : colors.homeSurface,
          shadowColor: colors.homeShadow,
        }]}
      >
        <View style={{
          width: innerW, height: innerH, overflow: 'hidden',
          borderRadius: style === 'shadowbox' ? 4 : radius.sm,
          // Plain boards and lanyards have no frame: a hairline edge instead.
          borderWidth: style === 'plain' || style === 'lanyard' ? 1 : 0,
          borderColor: colors.homeLine,
        }}>
          <Backdrop style={style} width={innerW} height={innerH} pinSize={pinSize} count={ids.length} />
          {pins.map(pin => (
            <BoardPin
              key={pin.id}
              pin={pin}
              style={style}
              placement={placements[pin.id]}
              size={pinSize}
              boardWidth={innerW}
              sizeFraction={sizeFraction}
              arranging={arranging}
              onOpen={() => onOpenPin(pin)}
              onMove={p => setPlacement(pin.id, p)}
            />
          ))}
          {style === 'shadowbox' && <Glass width={innerW} height={innerH} />}
        </View>
      </View>

      {editable && (
        <View style={[styles.controls, { width }]}>
          <TouchableOpacity
            onPress={() => setArranging(a => !a)}
            accessibilityRole="button"
            accessibilityLabel={arranging ? 'Done arranging' : 'Arrange pins'}
            style={[styles.btn, arranging
              ? { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }
              : { backgroundColor: colors.homeSurface, borderColor: colors.homeCoral }]}
          >
            <Feather name={arranging ? 'check' : 'move'} size={16} color={arranging ? colors.homeHeroText : colors.homeCoralDeep} />
            <Text style={[styles.btnText, { color: arranging ? colors.homeHeroText : colors.homeCoralDeep }]}>
              {arranging ? 'Done' : 'Arrange'}
            </Text>
          </TouchableOpacity>
          {arrangedByHand && (
            <TouchableOpacity
              onPress={tidy}
              accessibilityRole="button"
              accessibilityLabel="Tidy up into rows"
              style={[styles.btn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
            >
              <Feather name="grid" size={16} color={colors.homeInk} />
              <Text style={[styles.btnText, { color: colors.homeInk }]}>Tidy up</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.hint, { color: colors.homeMuted }]}>
            {arranging ? 'Drag pins to move them.' : 'Your layout is saved on this device.'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** The material behind the pins. */
function Backdrop({ style, width, height, pinSize, count }: { style: BoardStyle; width: number; height: number; pinSize: number; count: number }) {
  const colors = useColors();
  if (style === 'cork') return <Cork width={width} height={height} />;
  if (style === 'shadowbox') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.homeTeal }]}>
        {/* Depth: the frame's shadow falls on the felt. */}
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={[styles.edge, { top: 0, height: 28 }]} />
        <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.edge, { left: 0, top: 0, bottom: 0, width: 22, right: undefined }]} />
      </View>
    );
  }
  if (style === 'lanyard') {
    const { rows } = boardGrid(count);
    const strap = Math.max(18, pinSize * 0.42);
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.homeSurface }]}>
        {Array.from({ length: rows }, (_, i) => {
          const centre = ((i + 0.5) / rows) * height;
          return (
            <View key={i} style={[styles.strap, { top: centre - strap / 2, height: strap, backgroundColor: colors.homeCoralDeep }]}>
              <View style={[styles.stitch, { top: 4, borderColor: colors.homeHeroMuted }]} />
              <View style={[styles.stitch, { bottom: 4, borderColor: colors.homeHeroMuted }]} />
              <View style={[styles.clip, { height: strap * 0.7, top: strap * 0.15 }]} />
            </View>
          );
        })}
      </View>
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.homeAqua }]} />;
}

/** Cork texture: two tones of speckle, seeded so it never shimmers between renders. */
function Cork({ width, height }: { width: number; height: number }) {
  const dots = useMemo(() => {
    const n = Math.min(420, Math.round((width * height) / 900));
    const rand = seededRandom(0x5eed);
    return Array.from({ length: n }, () => ({
      cx: rand() * width,
      cy: rand() * height,
      r: 0.6 + rand() * 1.6,
      dark: rand() > 0.45,
    }));
  }, [width, height]);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: CORK.base }]}>
      <Svg width={width} height={height} accessible={false}>
        {dots.map((d, i) => <Circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.dark ? CORK.dark : CORK.light} />)}
      </Svg>
    </View>
  );
}

/** Mulberry32: a small seeded generator, so the cork looks the same every time. */
function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A faint diagonal glare across the shadow box glass. */
function Glass({ width, height }: { width: number; height: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
      locations={[0.35, 0.5, 0.65]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { width, height }]}
    />
  );
}

interface BoardPinProps {
  pin: CataloguePin;
  style: BoardStyle;
  placement: PinPlacement;
  size: number;
  boardWidth: number;
  sizeFraction: number;
  arranging: boolean;
  onOpen: () => void;
  onMove: (p: PinPlacement) => void;
}

function BoardPin({ pin, style, placement, size, boardWidth, sizeFraction, arranging, onOpen, onMove }: BoardPinProps) {
  const colors = useColors();
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const boardHeight = boardWidth / BOARD_ASPECT;

  const gesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .enabled(arranging)
    .minDistance(2)
    .onStart(() => setDrag({ dx: 0, dy: 0 }))
    .onUpdate(e => setDrag({ dx: e.translationX, dy: e.translationY }))
    .onEnd(e => onMove(movePlacement(placement, e.translationX, e.translationY, boardWidth, sizeFraction)))
    .onFinalize(() => setDrag(null)), [arranging, placement, boardWidth, sizeFraction, onMove]);

  const carded = style === 'cork' || style === 'plain';
  const left = placement.x * boardWidth - size / 2 + (drag?.dx ?? 0);
  const top = placement.y * boardHeight - size / 2 + (drag?.dy ?? 0);

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={[styles.pin, {
          left, top, width: size, height: size,
          zIndex: drag ? 10 : 1,
          transform: [{ rotate: `${drag ? 0 : placement.r}deg` }, { scale: drag ? 1.08 : 1 }],
        }]}
      >
        <Pressable
          onPress={arranging ? undefined : onOpen}
          disabled={arranging}
          accessibilityRole={arranging ? undefined : 'button'}
          accessibilityLabel={pin.title}
          style={[styles.pinFace, carded && {
            backgroundColor: '#FFFFFF',
            borderRadius: radius.md,
            padding: size * 0.06,
          }, {
            shadowColor: '#000000',
            shadowOpacity: drag ? 0.45 : carded ? 0.35 : 0.5,
            shadowRadius: drag ? 14 : 5,
            shadowOffset: { width: 0, height: drag ? 10 : 3 },
            elevation: drag ? 10 : 4,
          }, arranging && { borderWidth: 1.5, borderColor: colors.homeCoral, borderRadius: radius.md }]}
        >
          <PinImage source={getPinImageSource(pin)} accessible={false} contentFit="contain" style={styles.pinImage} />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, alignItems: 'center' },
  board: {
    borderRadius: radius.lg,
    shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  edge: { position: 'absolute', left: 0, right: 0 },
  strap: { position: 'absolute', left: 0, right: 0, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  stitch: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6 },
  clip: { position: 'absolute', left: 6, width: 22, borderRadius: 5, backgroundColor: '#C9C6DE', borderWidth: 1, borderColor: '#A7A4BE' },
  pin: { position: 'absolute' },
  pinFace: { flex: 1 },
  pinImage: { width: '100%', height: '100%' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  btn: {
    minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  btnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  hint: { flex: 1, minWidth: 160, fontSize: 13, fontFamily: 'Inter_500Medium' },
});
