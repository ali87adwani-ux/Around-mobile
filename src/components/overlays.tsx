import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@/theme';
import { Button, Row, Txt, haptic, type IconName } from './ui';

/* ---------- Toast ---------- */

type ToastKind = 'success' | 'info' | 'error';
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind; key: number } | null>(null);
  const y = useRef(new Animated.Value(-120)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const native = Platform.OS !== 'web';

  const show = useCallback(
    (msg: string, kind: ToastKind = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ msg, kind, key: Date.now() });
      if (kind === 'success') haptic.success();
      Animated.spring(y, { toValue: 0, useNativeDriver: native, bounciness: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: native }).start(() => setToast(null));
      }, 2600);
    },
    [y, native],
  );

  const icon: Record<ToastKind, IconName> = { success: 'checkmark-circle', info: 'information-circle', error: 'alert-circle' };
  const tint: Record<ToastKind, string> = { success: '#6FE3B0', info: colors.accent, error: '#FF9A9A' };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: space.lg, right: space.lg, top: insets.top + 8, transform: [{ translateY: y }], zIndex: 1000 }}
        >
          <Row gap={10} style={{ backgroundColor: colors.primaryDeep, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: 14 }}>
            <Ionicons name={icon[toast.kind]} size={22} color={tint[toast.kind]} />
            <Txt v="bodyStrong" color={colors.white} style={{ flex: 1 }}>
              {toast.msg}
            </Txt>
          </Row>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Bottom sheet ---------- */

export function Sheet({ visible, onClose, children, title }: { visible: boolean; onClose: () => void; children: React.ReactNode; title?: string }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, { toValue: 1, useNativeDriver: native, bounciness: 2, speed: 14 }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: native }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.overlay, opacity: anim }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="close" />
        </Animated.View>
        <Animated.View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: space.xl,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.xl,
            maxWidth: 640,
            width: '100%',
            alignSelf: 'center',
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
          }}
        >
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.lg }} />
          {title && (
            <Txt v="h2" style={{ marginBottom: space.lg }}>
              {title}
            </Txt>
          )}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', gap: space.sm, marginBottom: space.xl }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: danger ? colors.dangerSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={danger ? 'warning' : 'help-circle'} size={30} color={danger ? colors.danger : colors.primary} />
        </View>
        <Txt v="h2" center>
          {title}
        </Txt>
        {body && (
          <Txt v="body" color={colors.textMuted} center>
            {body}
          </Txt>
        )}
      </View>
      <View style={{ gap: space.sm }}>
        <Button title={confirmLabel} kind={danger ? 'danger' : 'primary'} onPress={onConfirm} />
        <Button title={cancelLabel} kind="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}
