import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { Animated, Image, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Field, Row, Tap, Txt, haptic, webNoOutline, type IconName } from '@/components/ui';
import type { Lang, Level, Position } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';

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
  const { t, state, dispatch, lang, mode, signedIn, sendCode, verifyCode, signInGuest, signInWithGoogle, saveProfile, errText } = useApp();
  const insets = useSafeAreaInsets();
  // step 0 = language, 1..3 = slides, 4 = profile, 5 = phone, 6 = code (live mode only)
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.profile.name);
  useEffect(() => {
    if (state.profile.name && !name) setName(state.profile.name);
  }, [state.profile.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const [phone, setPhone] = useState(state.profile.phone);
  const [position, setPosition] = useState<Position>(state.profile.position);
  const [level, setLevel] = useState<Level>(state.profile.level);
  const [tried, setTried] = useState(false);
  const needAuth = mode === 'live' && !signedIn;
  const go = (n: number) => setStep(n >= 4 && needAuth ? 5 : n);
  const [code, setCode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const fullPhone = `+965${phone.replace(/\D/g, '')}`;
  const phoneValid = /^[4569]\d{7}$/.test(phone.replace(/\D/g, ''));

  // Once signed in (code verified or guest), continue to the player card.
  useEffect(() => {
    if (signedIn && step >= 5) setStep(4);
  }, [signedIn, step]);

  const requestCode = async () => {
    if (!phoneValid) return setAuthError(errText('invalid_phone'));
    setAuthBusy(true);
    setAuthError(undefined);
    const r = await sendCode(fullPhone);
    setAuthBusy(false);
    if (!r.ok) return setAuthError(errText('sms_failed'));
    setCode('');
    setStep(6);
  };

  const confirmCode = async () => {
    setAuthBusy(true);
    setAuthError(undefined);
    const r = await verifyCode(fullPhone, code);
    setAuthBusy(false);
    if (!r.ok) {
      haptic.warn();
      setAuthError(errText('invalid_code'));
    }
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

  if (step === 5 || step === 6) {
    const isCode = step === 6;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <FadeIn key={step} style={{ gap: space.xl }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={isCode ? 'chatbubble-ellipses' : 'call'} size={30} color={colors.primary} />
            </View>
            <View style={{ gap: 6 }}>
              <Txt v="display">{isCode ? t('codeTitle') : t('phoneTitle')}</Txt>
              <Txt v="body" color={colors.textMuted}>
                {isCode ? t('codeBody', { phone: fullPhone }) : t('phoneBody')}
              </Txt>
            </View>
            {isCode ? (
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoFocus
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={colors.textFaint}
                style={{ height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: authError ? colors.danger : colors.border, backgroundColor: colors.card, fontSize: 30, letterSpacing: 12, textAlign: 'center', color: colors.text, fontFamily: fonts.bold, ...webNoOutline }}
              />
            ) : (
              <Row gap={8} style={{ direction: 'ltr' } as object}>
                <View style={{ height: 56, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, justifyContent: 'center' }}>
                  <Txt v="bodyStrong">🇰🇼 +965</Txt>
                </View>
                <TextInput
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 8))}
                  keyboardType="phone-pad"
                  autoFocus
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  placeholder={t('phonePlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  style={{ flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: authError ? colors.danger : colors.border, backgroundColor: colors.card, paddingHorizontal: space.lg, fontSize: 20, letterSpacing: 2, color: colors.text, fontFamily: fonts.semibold, textAlign: 'left', ...webNoOutline }}
                />
              </Row>
            )}
            {authError && (
              <Row gap={6}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Txt v="caption" color={colors.danger} style={{ flex: 1 }}>
                  {authError}
                </Txt>
              </Row>
            )}
          </FadeIn>
        </ScrollView>
        <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg, gap: space.sm }}>
          {isCode ? (
            <>
              <Button title={t('verify')} icon="checkmark-circle" disabled={code.length < 6} loading={authBusy} onPress={confirmCode} />
              <Row justify="space-between">
                <Tap onPress={() => setStep(5)} hitSlop={8}>
                  <Txt v="label" color={colors.primary}>{t('changeNumber')}</Txt>
                </Tap>
                <Tap onPress={requestCode} hitSlop={8}>
                  <Txt v="label" color={colors.primary}>{t('resend')}</Txt>
                </Tap>
              </Row>
            </>
          ) : (
            <>
              <Button title={t('sendCode')} icon="chatbubble" disabled={!phoneValid} loading={authBusy} onPress={requestCode} />
              <Row gap={space.md} style={{ marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <Txt v="caption" color={colors.textFaint}>{t('or')}</Txt>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </Row>
              <Button title={t('continueGoogle')} kind="ghost" icon="logo-google" loading={googleBusy} onPress={google} />
              <Tap onPress={guest} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
                <Txt v="label" color={colors.textMuted}>{t('tryWithoutPhone')}</Txt>
              </Tap>
            </>
          )}
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
            {mode === 'demo' && <Field label={t('phone')} placeholder={t('phonePlaceholder')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
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
