/**
 * Full-screen pin camera (#392): the live ScanCamera filling the screen, the
 * shutter bottom-middle like the iPhone camera, library on its left, torch
 * on its right, and a close button. Used by Add a pin (#394) for the front
 * photo; the photo comes back already cropped to the frame.
 *
 * iOS/Android only (expo-camera). Web keeps the photo picker.
 *
 * The library button closes the camera first and opens the system picker
 * only once the modal has gone: iOS from onDismiss, Android after
 * interactions settle (see .agents/memory/expo-native-picker-presentation.md).
 */
import React, { useEffect, useRef } from 'react';
import { InteractionManager, Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ScanCamera, type ScanCameraPhoto } from '@/components/scan/ScanCamera';

interface FullScreenCameraProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (photo: ScanCameraPhoto) => void;
  onError: () => void;
  /** Switch to the photo library instead. */
  onLibrary: () => void;
  coach?: string;
}

export function FullScreenCamera({ visible, onClose, onCapture, onError, onLibrary, coach }: FullScreenCameraProps) {
  const insets = useSafeAreaInsets();
  const wantsLibrary = useRef(false);

  const openLibrary = () => {
    wantsLibrary.current = true;
    onClose();
  };
  const launchPendingLibrary = () => {
    if (!wantsLibrary.current) return;
    wantsLibrary.current = false;
    onLibrary();
  };
  // Android has no onDismiss: wait for the closing animation instead.
  useEffect(() => {
    if (visible || Platform.OS !== 'android' || !wantsLibrary.current) return;
    const task = InteractionManager.runAfterInteractions(launchPendingLibrary);
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === 'android' ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={() => { wantsLibrary.current = false; onClose(); }}
      onDismiss={launchPendingLibrary}
    >
      <View style={styles.root} testID="full-screen-camera">
        {visible && (
          <ScanCamera
            active={visible}
            onCapture={onCapture}
            onError={onError}
            onLibrary={openLibrary}
            controlsBottom={insets.bottom + 24}
            coach={coach}
          />
        )}
        <TouchableOpacity
          onPress={() => { wantsLibrary.current = false; onClose(); }}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          hitSlop={8}
          style={[styles.close, { top: insets.top + 8 }]}
        >
          <Feather name="x" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a18' },
  close: {
    position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
