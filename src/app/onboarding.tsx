import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Chip, Field, Row, Tap, Txt, haptic, type IconName } from '@/components/ui';
import { ALLOW_GUEST } from '@/config';
import type { Lang, Level, Position } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

const slides: { icon: IconName; title: 'ob1Title' | 'ob2Title' | 'ob3Title'; body: 'ob1Body' | 'ob2Body' | 'ob3Body' }[] = [
  { icon: 'calendar', title: 'ob1Title', body: 'ob1Body' },
  { icon: 'people', title: 'ob2Title', body: 'ob2Body' },
  { icon: 'trophy', title: 'ob3Title', body: 'ob3Body' },
];

function FadeIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>
  );
}

export default function Onboarding() {
  const { t, state, dispatch, lang, mode, signedIn, signInGuest, signInWithGoogle, signInWithApple, saveProfile, errText, themeName } = useApp();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const artW = Math.min(winW - 48, 340);
  const artH = artW * 0.705;
  // step 0 = language, 1..3 = slides, 4 = profile, 5 = sign in with Apple / Google (live mode only)
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.profile.name);
  useEffect(() => {
    if (state.profile.name && !name) setName(state.profile.name);
  }, [state.profile.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const phone = state.profile.phone;
  const [position, setPosition] = useState<Position>(state.profile.position);
  const [level, setLevel] = useState<Level>(state.profile.level);
  const [tried, setTried] = useState(false);
  const needAuth = mode === 'live' && !signedIn;
  const go = (n: number) => setStep(n >= 4 && needAuth ? 5 : n);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();

  // Once signed in, continue to the player card.
  useEffect(() => {
    if (signedIn && step >= 5) setStep(4);
  }, [signedIn, step]);

  const [appleBusy, setAppleBusy] = useState(false);
  const apple = async () => {
    setAppleBusy(true);
    setAuthError(undefined);
    const r = await signInWithApple();
    setAppleBusy(false);
    if (!r.ok && r.error !== 'cancelled') setAuthError(errText(r.error === 'oauth_failed' ? 'oauth_failed' : r.error));
  };

  const [googleBusy, setGoogleBusy] = useState(false);
  const google = async () => {
    setGoogleBusy(true);
    setAuthError(undefined);
    const r = await signInWithGoogle();
    setGoogleBusy(false);
    if (!r.ok && r.error !== 'cancelled') setAuthError(errText(r.error === 'oauth_failed' ? 'oauth_failed' : r.error));
  };

  const guest = async () => {
    setAuthBusy(true);
    const r = await signInGuest();
    setAuthBusy(false);
    if (!r.ok) setAuthError(errText(r.error));
  };

  const [saving, setSaving] = useState(false);
  const finish = async () => {
    setTried(true);
    if (!name.trim()) {
      haptic.warn();
      return;
    }
    setSaving(true);
    const r = await saveProfile({ name: name.trim(), phone, position, level });
    setSaving(false);
    if (!r.ok) return setAuthError(errText(r.error));
    haptic.success();
    dispatch({ type: 'completeOnboarding', profile: { name: name.trim(), phone, position, level } });
  };

  const LangOption = ({ value, title, sub }: { value: Lang; title: string; sub: string }) => {
    const sel = lang === value;
    return (
      <Tap
        onPress={() => dispatch({ type: 'setLang', lang: value })}
        accessibilityState={{ selected: sel }}
        style={{
          borderRadius: radius.lg,
          padding: space.lg,
          backgroundColor: sel ? colors.white : 'rgba(255,255,255,0.08)',
          borderWidth: 1.5,
          borderColor: sel ? colors.accent : 'rgba(255,255,255,0.18)',
        }}
      >
        <Row justify="space-between">
          <View>
            <Txt v="h2" color={sel ? colors.text : colors.white}>
              {title}
            </Txt>
            <Txt v="caption" color={sel ? colors.textMuted : 'rgba(255,255,255,0.7)'}>
              {sub}
            </Txt>
          </View>
          <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={sel ? colors.primary : 'rgba(255,255,255,0.5)'} />
        </Row>
      </Tap>
    );
  };

  if (step === 5) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, padding: space.xl, paddingTop: insets.top + space.xl, paddingBottom: 0 }}>
          <FadeIn key={step} style={{ gap: space.md, flex: 1 }}>
            <View style={{ gap: 6 }}>
              <Txt v="display">{t('signInTitle')}</Txt>
              <Txt v="body" color={colors.textMuted}>
                {t('signInBody')}
              </Txt>
            </View>
            {/* Player kicking, behind the wordmark */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: artW, alignItems: 'center' }}>
                <View style={{ position: 'absolute', top: artH * 0.02, left: (artW - artH * 0.98) / 2, width: artH * 0.98, height: artH * 0.98, borderRadius: artH, backgroundColor: themeName === 'dark' ? '#DCEBFA' : '#7CC0F5', opacity: themeName === 'dark' ? 0.92 : 0.16 }} />
                <Image source={require('../../assets/brand/art/kicker.png')} style={{ width: artW, height: artH }} resizeMode="contain" accessibilityIgnoresInvertColors />
                <Image
                  source={themeName === 'dark' ? require('../../assets/brand/lockup-white.png') : require('../../assets/brand/lockup-navy.png')}
                  style={{ width: 160, height: 97, marginTop: -22 }}
                  resizeMode="contain"
                  accessibilityLabel={t('appName')}
                />
              </View>
            </View>
            {authError && (
              <Row gap={6}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Txt v="caption" color={colors.danger} style={{ flex: 1 }}>
                  {authError}
                </Txt>
              </Row>
            )}
          </FadeIn>
        </View>
        <View style={{ padding: space.xl, paddingTop: space.sm, paddingBottom: insets.bottom + space.lg, gap: space.md }}>
          <Button title={t('continueApple')} kind="dark" icon="logo-apple" loading={appleBusy} onPress={apple} />
          <Button title={t('continueGoogle')} kind="ghost" icon="logo-google" loading={googleBusy} onPress={google} />
          {ALLOW_GUEST && (
            <Tap onPress={guest} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
              {authBusy ? <Txt v="label" color={colors.textMuted}>…</Txt> : <Txt v="label" color={colors.textMuted}>{t('tryWithoutAccount')}</Txt>}
            </Tap>
          )}
          <Txt v="tiny" color={colors.textFaint} center>
            {t('agreePrefix')}{' '}
            <Txt v="tiny" color={colors.primary} onPress={() => router.push('/legal/terms')}>
              {t('terms')}
            </Txt>{' '}
            {t('and')}{' '}
            <Txt v="tiny" color={colors.primary} onPress={() => router.push('/legal/privacy')}>
              {t('privacy')}
            </Txt>
          </Txt>
        </View>
      </View>
    );
  }

  if (step === 4) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <FadeIn key={step} style={{ gap: space.xl }}>
            <View style={{ gap: 6 }}>
              <Txt v="display">{t('setupTitle')}</Txt>
              <Txt v="body" color={colors.textMuted}>
                {t('setupBody')}
              </Txt>
            </View>
            <Field label={t('yourName')} placeholder={t('namePlaceholder')} value={name} onChangeText={setName} autoFocus returnKeyType="next" error={tried && !name.trim() ? t('required') : undefined} />
            <View style={{ gap: space.sm }}>
              <Txt v="label" color={colors.textMuted}>
                {t('position')}
              </Txt>
              <Row gap={8} wrap>
                {(['GK', 'DEF', 'MID', 'FWD'] as Position[]).map((p) => (
                  <Chip key={p} label={t(`pos_${p}`)} selected={position === p} onPress={() => setPosition(p)} />
                ))}
              </Row>
            </View>
            <View style={{ gap: space.sm }}>
              <Txt v="label" color={colors.textMuted}>
                {t('level')}
              </Txt>
              <Row gap={8} wrap>
                {(['beginner', 'intermediate', 'advanced'] as Level[]).map((lv) => (
                  <Chip key={lv} label={t(`level_${lv}`)} selected={level === lv} onPress={() => setLevel(lv)} />
                ))}
              </Row>
            </View>
          </FadeIn>
        </ScrollView>
        <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg, gap: space.sm }}>
          {authError && (
            <Txt v="caption" color={colors.danger} center>
              {authError}
            </Txt>
          )}
          <Button title={t('getStarted')} icon="football" loading={saving} onPress={finish} />
        </View>
      </View>
    );
  }

  const slide = step >= 1 ? slides[step - 1] : null;
  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark, colors.primaryDeep]} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.xl }}>
        <Row justify="space-between" style={{ height: 40 }}>
          {/* Wordmark is Arabic in both languages: it is the brand mark. */}
          <Image source={require('../../assets/brand/wordmark-white.png')} style={{ width: 92, height: 40 }} resizeMode="contain" accessibilityLabel={t('appName')} />
          {slide && (
            <Tap onPress={() => go(4)} hitSlop={12}>
              <Txt v="label" color="rgba(255,255,255,0.8)">
                {t('skip')}
              </Txt>
            </Tap>
          )}
        </Row>

        <FadeIn key={step} style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          {step === 0 ? (
            <>
              <Image source={require('../../assets/brand/lockup-white.png')} style={{ width: 200, height: 121, alignSelf: 'center' }} resizeMode="contain" />
              <View style={{ gap: 6 }}>
                <Txt v="display" color={colors.white}>
                  {t('tagline')}
                </Txt>
                <Txt v="body" color="rgba(255,255,255,0.75)">
                  اختر لغتك · Choose your language
                </Txt>
              </View>
              <View style={{ gap: space.md }}>
                <LangOption value="ar" title="العربية" sub="Arabic" />
                <LangOption value="en" title="English" sub="الإنجليزية" />
              </View>
            </>
          ) : (
            slide && (
              <>
                <View style={{ alignSelf: 'center', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(124,192,245,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={slide.icon} size={56} color={colors.primaryDark} />
                  </View>
                </View>
                <View style={{ gap: space.sm }}>
                  <Txt v="display" color={colors.white} center>
                    {t(slide.title)}
                  </Txt>
                  <Txt v="body" color="rgba(255,255,255,0.78)" center>
                    {t(slide.body)}
                  </Txt>
                </View>
              </>
            )
          )}
        </FadeIn>

        <View style={{ gap: space.lg }}>
          {slide && (
            <Row gap={6} justify="center">
              {slides.map((_, i) => (
                <View key={i} style={{ height: 8, width: i === step - 1 ? 26 : 8, borderRadius: 4, backgroundColor: i === step - 1 ? colors.accent : 'rgba(255,255,255,0.3)' }} />
              ))}
            </Row>
          )}
          <Button title={t('continue')} kind="light" onPress={() => go(step + 1)} />
        </View>
      </View>
    </LinearGradient>
  );
}
