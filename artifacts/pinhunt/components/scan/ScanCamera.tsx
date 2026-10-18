/**
 * Live scan camera for the Find tab (UX-009, #117; docs/design/scan-camera.md).
 *
 * A live preview with a square frame and a one-line coach ("One pin, fill
 * the frame"), a torch toggle and a shutter. The photo is cropped to the
 * frame before it's handed on, so there's no separate crop screen: one tap
 * from preview to identifying.
 *
 * Permission states: not asked yet → a short card with "Allow camera";
 * refused for good → how to turn it on in Settings, while "Choose Photo"
 * below keeps scanning possible. Only rendered on iOS/Android; web keeps the
 * photo picker.
 *
 * Full screen (#392): with `onLibrary` the shutter row works like the iPhone
 * camera: library on the left, shutter in the middle, torch on the right,
 * lifted by `controlsBottom` to clear the tab bar or home indicator.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { frameCrop } from '@/utils/frameCrop';

export interface ScanCameraPhoto {
  uri: string;
  width: number;
  height: number;
}

interface ScanCameraProps {
  /** Run the camera only while it's on screen (tab focused, nothing captured). */
  active: boolean;
  /** The photo, already cropped to the frame. */
  onCapture: (photo: ScanCameraPhoto) => void;
  /** Taking or cropping the photo failed. */
  onError: () => void;
  /** Shows a library button beside the shutter (full-screen layout, #392). */
  onLibrary?: () => void;
  /** Distance from the bottom edge to the shutter row. */
  controlsBottom?: number;
  /** The frame's coach line. */
  coach?: string;
}

/** The frame's side as a share of the preview's shorter side. */
export const FRAME_SHARE = 0.72;

export function ScanCamera({ active, onCapture, onError, onLibrary, controlsBottom = 14, coach = 'One pin, fill the frame' }: ScanCameraProps) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);

  const frameSize = Math.min(size.width, size.height) * FRAME_SHARE;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!shot) throw new Error('No photo');
      const crop = frameCrop({
        photoWidth: shot.width, photoHeight: shot.height,
        viewWidth: size.width, viewHeight: size.height, frameSize,
      });
      const cropped = await ImageManipulator.manipulateAsync(shot.uri, [{ crop }], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
      onCapture({ uri: cropped.uri, width: cropped.width, height: cropped.height });
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  };

  const torchButton = (
    <TouchableOpacity
      onPress={() => setTorch(t => !t)}
      accessibilityRole="switch"
      accessibilityLabel="Torch"
      accessibilityState={{ checked: torch }}
      hitSlop={8}
      style={[styles.round, torch && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
    >
      <Feather name="zap" size={18} color={torch ? '#0a0a18' : '#fff'} />
    </TouchableOpacity>
  );

  // Still finding out whether we may use the camera.
  if (!permission) {
    return (
      <View style={styles.message} testID="scan-camera-loading">
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <View style={styles.message}>
        <Feather name="camera" size={40} color="rgba(255,255,255,0.45)" />
        <Text style={styles.messageTitle} accessibilityRole="header">
          {canAsk ? 'Scan with your camera' : 'Camera is off for PinHunt'}
        </Text>
        <Text style={styles.messageBody}>
          {canAsk
            ? 'PinHunt uses the camera to identify pins you scan.'
            : `Turn on Camera for PinHunt in Settings, or choose a photo${onLibrary ? '' : ' below'}.`}
        </Text>
        <Button
          label={canAsk ? 'Allow camera' : 'Open Settings'}
          icon={canAsk ? 'camera' : 'settings'}
          size="compact"
          fullWidth={false}
          onPress={() => (canAsk ? requestPermission() : Linking.openSettings())}
        />
        {/* Full screen there's no "Choose Photo" below, so offer it here. */}
        {onLibrary && (
          <Button label="Choose Photo" icon="image" variant="secondary" size="compact" fullWidth={false} onPress={onLibrary} />
        )}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} testID="scan-camera-root">
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        active={active}
        onCameraReady={() => setReady(true)}
        testID="scan-camera"
      />

      {/* Frame and coach; static, so there's no motion to reduce. */}
      {frameSize > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[styles.frame, {
              width: frameSize, height: frameSize,
              left: (size.width - frameSize) / 2, top: (size.height - frameSize) / 2,
            }]}
          >
            {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
              <View
                key={c}
                style={[
                  styles.bracket,
                  { borderColor: colors.homeSand },
                  c[0] === 't' ? styles.bracketTop : styles.bracketBottom,
                  c[1] === 'l' ? styles.bracketLeft : styles.bracketRight,
                ]}
              />
            ))}
          </View>
          <View style={[styles.coach, { top: Math.max(12, (size.height - frameSize) / 2 - 40) }]}>
            <Text style={styles.coachText} accessibilityRole="text">{coach}</Text>
          </View>
        </View>
      )}

      <View style={[styles.bar, { bottom: controlsBottom }]}>
        {onLibrary ? (
          <TouchableOpacity
            onPress={onLibrary}
            accessibilityRole="button"
            accessibilityLabel="Choose a photo from your library"
            hitSlop={8}
            style={styles.round}
          >
            <Feather name="image" size={18} color="#fff" />
          </TouchableOpacity>
        ) : torchButton}
        <TouchableOpacity
          onPress={capture}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          accessibilityState={{ disabled: !ready || busy, busy }}
          style={[styles.shutter, (!ready || busy) && { opacity: 0.5 }]}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        {/* Balances the left button so the shutter sits in the middle. */}
        {onLibrary ? torchButton : <View style={styles.roundSpacer} />}
      </View>
    </View>
  );
}

const BRACKET = 26;

const styles = StyleSheet.create({
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28, alignSelf: 'stretch' },
  messageTitle: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center' },
  messageBody: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 6 },
  frame: { position: 'absolute' },
  bracket: { position: 'absolute', width: BRACKET, height: BRACKET, borderWidth: 3 },
  bracketTop: { top: 0, borderBottomWidth: 0 },
  bracketBottom: { bottom: 0, borderTopWidth: 0 },
  bracketLeft: { left: 0, borderRightWidth: 0 },
  bracketRight: { right: 0, borderLeftWidth: 0 },
  coach: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  coachText: {
    color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden',
  },
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  roundSpacer: { width: 44, height: 44 },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
});
