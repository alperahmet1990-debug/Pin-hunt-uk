import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  /** One optional action, e.g. "Undo" or "View board". Tapping it also dismisses the toast. */
  action?: ToastAction;
  /** Milliseconds on screen. Default 4500. */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  hide: () => void;
  /** Internal: hosts register so only the top-most one (e.g. inside a modal sheet) renders. */
  registerHost: (id: number) => () => void;
  topHost: number | null;
  toast: ToastState | null;
}

export const TOAST_DURATION_MS = 4500;

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * One app-wide toast: a short confirmation with an optional action (Undo).
 * Mounted once in app/_layout.tsx with a root <ToastHost />. Screens that
 * cover the root on iOS (RN <Modal> sheets) render their own <ToastHost />
 * so the toast stays visible above them; only the most recently mounted
 * host draws it.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [hosts, setHosts] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = nextId.current++;
    setToast({ ...options, id });
    timer.current = setTimeout(() => {
      timer.current = null;
      setToast(current => (current?.id === id ? null : current));
    }, options.duration ?? TOAST_DURATION_MS);
    AccessibilityInfo.announceForAccessibility?.(
      options.action ? `${options.message}. ${options.action.label} available.` : options.message,
    );
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const registerHost = useCallback((id: number) => {
    setHosts(prev => [...prev, id]);
    return () => setHosts(prev => prev.filter(h => h !== id));
  }, []);

  const value = useMemo(
    () => ({ show, hide, registerHost, topHost: hosts.length ? hosts[hosts.length - 1] : null, toast }),
    [show, hide, registerHost, hosts, toast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): Pick<ToastContextValue, 'show' | 'hide'> {
  const ctx = useContext(ToastContext);
  // Outside the provider (isolated component tests) toasts are a no-op.
  return ctx ?? NOOP;
}

const NOOP = { show: () => {}, hide: () => {} };

let hostSeq = 0;

/** Where the toast draws. "bottom" sits above the tab bar; "top" suits bottom sheets. */
export function ToastHost({ placement = 'bottom' }: { placement?: 'bottom' | 'top' }) {
  const ctx = useContext(ToastContext);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [id] = useState(() => ++hostSeq);
  const opacity = useRef(new Animated.Value(0)).current;

  const register = ctx?.registerHost;
  useEffect(() => (register ? register(id) : undefined), [register, id]);

  const toast = ctx?.toast ?? null;
  const visible = !!toast && ctx?.topHost === id;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [visible, toast?.id, opacity]);

  if (!visible || !toast || !ctx) return null;

  // Bottom: clear of the tab bar (49 pt + home indicator) on native; web has a 34 pt footer pad.
  const position = placement === 'top'
    ? { top: insets.top + spacing.md }
    : { bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 64 };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, position]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, { opacity, backgroundColor: colors.homeInk }]}
      >
        <Feather name="check-circle" size={16} color={colors.homeSurface} />
        <Text style={[styles.message, { color: colors.homeSurface }]} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action && (
          <TouchableOpacity
            onPress={() => { const run = toast.action!.onPress; ctx.hide(); run(); }}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={styles.actionBtn}
          >
            <Text style={[styles.actionLabel, { color: colors.homeSurface }]}>{toast.action.label}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center', zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    maxWidth: 480,
    width: '100%',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: 'Inter_500Medium' },
  actionBtn: { minHeight: 32, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', textDecorationLine: 'underline' },
});
