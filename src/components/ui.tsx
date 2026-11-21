import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewInstance,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, shadow, space } from '@/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const haptic = {
  light: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  select: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
};

// Hide the browser focus ring on web; focus is shown by the border colour instead.
export const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

/* ---------- Text ---------- */

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'tiny';
const variantStyle: Record<Variant, TextStyle> = {
  display: { fontSize: 30, fontFamily: fonts.black, lineHeight: 40 },
  h1: { fontSize: 24, fontFamily: fonts.bold, lineHeight: 34 },
  h2: { fontSize: 19, fontFamily: fonts.bold, lineHeight: 28 },
  h3: { fontSize: 16, fontFamily: fonts.bold, lineHeight: 26 },
  body: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 24 },
  bodyStrong: { fontSize: 15, fontFamily: fonts.semibold, lineHeight: 24 },
  caption: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 20 },
  label: { fontSize: 13, fontFamily: fonts.bold, lineHeight: 20 },
  tiny: { fontSize: 11, fontFamily: fonts.semibold, lineHeight: 16 },
};

export function Txt({
  v = 'body',
  color = colors.text,
  center,
  style,
  ...rest
}: TextProps & { v?: Variant; color?: string; center?: boolean }) {
  const { isRTL } = useApp();
  return (
    <Text
      {...rest}
      style={[
        variantStyle[v],
        { color, textAlign: center ? 'center' : isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
        style,
      ]}
    />
  );
}

/* ---------- Layout ---------- */

export function Row({ style, gap, align = 'center', justify, wrap, ...rest }: ViewProps & { gap?: number; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; wrap?: boolean }) {
  const { isRTL } = useApp();
  return (
    <View
      {...rest}
      style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : undefined }, style]}
    />
  );
}

export function useDir() {
  const { isRTL } = useApp();
  return {
    isRTL,
    row: (isRTL ? 'row-reverse' : 'row') as ViewStyle['flexDirection'],
    start: (isRTL ? 'right' : 'left') as 'left' | 'right',
    alignStart: (isRTL ? 'flex-end' : 'flex-start') as ViewStyle['alignItems'],
    forward: (isRTL ? 'chevron-back' : 'chevron-forward') as IconName,
    backIcon: (isRTL ? 'chevron-forward' : 'chevron-back') as IconName,
    arrowForward: (isRTL ? 'arrow-back' : 'arrow-forward') as IconName,
  };
}

export function Spacer({ h = space.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

/* ---------- Pressables ---------- */

const OUTER_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);

export function Tap({ style, onPress, haptics = true, scale = 0.97, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; haptics?: boolean; scale?: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(anim, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 6 }).start();
  // Layout props (size/position within the parent) must live on the Pressable itself;
  // visual props stay on the animated inner view so the press-scale effect works.
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle & Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = flat[k];
  if (outer.flex != null || outer.width != null) inner.flexGrow = 1;
  return (
    <Pressable
      {...rest}
      style={outer as ViewStyle}
      onPressIn={() => to(scale)}
      onPressOut={() => to(1)}
      onPress={(e) => {
        if (haptics) haptic.light();
        onPress?.(e);
      }}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
    >
      <Animated.View style={[inner as ViewStyle, { transform: [{ scale: anim }] }]}>{children as React.ReactNode}</Animated.View>
    </Pressable>
  );
}

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'dark' | 'light';
const btnColors = (): Record<BtnKind, { bg: string; fg: string; border?: string }> => ({
  primary: { bg: colors.primary, fg: colors.white },
  accent: { bg: colors.accent, fg: colors.primaryDark },
  secondary: { bg: colors.primarySoft, fg: colors.primary },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  dark: { bg: colors.inverse, fg: colors.onInverse },
  light: { bg: colors.white, fg: '#0B2E6F' },
});

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = btnColors()[kind];
  const { isRTL } = useApp();
  return (
    <Tap
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        {
          backgroundColor: c.bg,
          borderColor: c.border ?? 'transparent',
          borderWidth: c.border ? 1 : 0,
          height: small ? 40 : 54,
          paddingHorizontal: small ? space.lg : space.xl,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: isRTL ? 'row-reverse' : 'row',
          gap: space.sm,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={c.fg} />}
          <Txt v={small ? 'label' : 'h3'} color={c.fg} center>
            {title}
          </Txt>
        </>
      )}
    </Tap>
  );
}

export function IconButton({ icon, onPress, color = colors.text, bg = colors.card, size = 42, label, badge }: { icon: IconName; onPress?: () => void; color?: string; bg?: string; size?: number; label?: string; badge?: boolean }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
      {badge && <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 2, borderColor: bg }} />}
    </Tap>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ style, children, onPress, flat }: { style?: StyleProp<ViewStyle>; children: React.ReactNode; onPress?: () => void; flat?: boolean }) {
  const base: StyleProp<ViewStyle> = [{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg }, !flat && shadow, style];
  if (onPress)
    return (
      <Tap onPress={onPress} style={base} scale={0.985}>
        {children}
      </Tap>
    );
  return <View style={base}>{children}</View>;
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { isRTL } = useApp();
  return (
    <Tap
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      haptics={false}
      accessibilityState={{ selected }}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.inverse : colors.card,
        borderWidth: 1,
        borderColor: selected ? colors.inverse : colors.border,
      }}
    >
      {icon && <Ionicons name={icon} size={15} color={selected ? colors.onInverse : colors.textMuted} />}
      <Txt v="label" color={selected ? colors.onInverse : colors.text}>
        {label}
      </Txt>
    </Tap>
  );
}

export function Badge({ label, color = colors.primary, bg = colors.primarySoft, icon }: { label: string; color?: string; bg?: string; icon?: IconName }) {
  return (
    <Row gap={4} style={{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Txt v="tiny" color={color}>
        {label}
      </Txt>
    </Row>
  );
}

export function Avatar({ name, color = colors.primary, size = 40, ring, uri }: { name: string; color?: string; size?: number; ring?: boolean; uri?: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2.5 : 0,
        borderColor: colors.white,
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ color: colors.white, fontFamily: fonts.bold, fontSize: size * 0.36 }}>{initials || '?'}</Text>
      )}
    </View>
  );
}

export function AvatarStack({ names, colorsList, uris, max = 4, size = 30 }: { names: string[]; colorsList: string[]; uris?: (string | undefined)[]; max?: number; size?: number }) {
  const { isRTL } = useApp();
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
      {shown.map((n, i) => (
        <View key={i} style={{ [isRTL ? 'marginRight' : 'marginLeft']: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar name={n} color={colorsList[i]} uri={uris?.[i]} size={size} ring />
        </View>
      ))}
      {extra > 0 && (
        <View style={{ [isRTL ? 'marginRight' : 'marginLeft']: -size * 0.32, width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: colors.white }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.34, color: colors.textMuted }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export function Progress({ value, color = colors.primary, height = 6 }: { value: number; color?: string; height?: number }) {
  const { isRTL } = useApp();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.border, overflow: 'hidden', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const d = useDir();
  return (
    <Row justify="space-between" style={{ marginBottom: space.md }}>
      <Txt v="h2">{title}</Txt>
      {action && (
        <Tap onPress={onAction} hitSlop={10}>
          <Row gap={2}>
            <Txt v="label" color={colors.primary}>
              {action}
            </Txt>
            <Ionicons name={d.forward} size={16} color={colors.primary} />
          </Row>
        </Tap>
      )}
    </Row>
  );
}

export function EmptyState({ icon, title, body, action, onAction }: { icon: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm }}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Txt v="h3" center>
        {title}
      </Txt>
      {body && (
        <Txt v="caption" color={colors.textMuted} center>
          {body}
        </Txt>
      )}
      {action && <Button title={action} onPress={onAction} small kind="secondary" style={{ marginTop: space.md }} />}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string }) {
  const { isRTL } = useApp();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt v="label" color={colors.textMuted}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={{
          height: 54,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: space.lg,
          fontFamily: fonts.medium,
          fontSize: 16,
          color: colors.text,
          textAlign: isRTL ? 'right' : 'left',
          writingDirection: isRTL ? 'rtl' : 'ltr',
          ...webNoOutline,
        }}
      />
      {error && (
        <Txt v="tiny" color={colors.danger}>
          {error}
        </Txt>
      )}
    </View>
  );
}

/* ---------- Pitch illustration ---------- */

export function PitchArt({ tint, height = 150, radiusSize = radius.lg, children, style }: { tint: [string, string]; height?: number; radiusSize?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ height, borderRadius: radiusSize, overflow: 'hidden' }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 18}%`, width: '9%', backgroundColor: 'rgba(255,255,255,0.045)' }} />
        ))}
        <View style={{ position: 'absolute', top: 14, bottom: 14, left: 14, right: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 6 }} />
        <View style={{ position: 'absolute', top: 14, bottom: 14, left: '50%', width: 1.5, backgroundColor: 'rgba(255,255,255,0.22)' }} />
        <View style={{ position: 'absolute', top: '50%', left: '50%', width: height * 0.36, height: height * 0.36, marginLeft: -height * 0.18, marginTop: -height * 0.18, borderRadius: height, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' }} />
        <View style={{ position: 'absolute', top: '32%', bottom: '32%', left: 14, width: '11%', borderWidth: 1.5, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.22)' }} />
        <View style={{ position: 'absolute', top: '32%', bottom: '32%', right: 14, width: '11%', borderWidth: 1.5, borderRightWidth: 0, borderColor: 'rgba(255,255,255,0.22)' }} />
      </View>
      {children}
    </LinearGradient>
  );
}

export function Stat({ value, label, icon, color = colors.primary }: { value: string | number; label: string; icon?: IconName; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      {icon && <Ionicons name={icon} size={18} color={color} />}
      <Txt v="h2" center>
        {value}
      </Txt>
      <Txt v="tiny" color={colors.textMuted} center>
        {label}
      </Txt>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { isRTL } = useApp();
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic.select();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            style={[{ flex: 1, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }, sel && { backgroundColor: colors.card, ...shadow, shadowOpacity: 0.06 }]}
          >
            <Txt v="label" color={sel ? colors.text : colors.textMuted} center>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Direction-aware horizontal scroller ---------- */

export function HScroll({ children, gap = space.md, padding = space.lg }: { children: React.ReactNode; gap?: number; padding?: number }) {
  const { isRTL } = useApp();
  const ref = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => isRTL && ref.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ paddingHorizontal: padding, gap, paddingBottom: space.md, flexDirection: isRTL ? 'row-reverse' : 'row' }}
    >
      {children}
    </ScrollView>
  );
}
