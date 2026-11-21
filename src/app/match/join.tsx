/** Join a game with its invite code (private games, or a link a friend shared). */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Txt, haptic, webNoOutline } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';

export default function JoinMatch() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { t, errText, joinMatchByCode } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState((params.code ?? '').toUpperCase().slice(0, 6));
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    const r = await joinMatchByCode(code);
    setBusy(false);
    if (!r.ok || !r.id) {
      haptic.warn();
      return toast(errText(r.ok ? 'unknown' : r.error), 'error');
    }
    haptic.success();
    toast(t('joinedToast'), 'success');
    router.replace(`/match/${r.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('joinGameCode')} />
      <View style={{ padding: space.xl, gap: space.xl, flex: 1 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="football" size={30} color={colors.primary} />
        </View>
        <View style={{ gap: 6 }}>
          <Txt v="display">{t('joinGameCode')}</Txt>
          <Txt v="body" color={colors.textMuted}>
            {t('joinGameCodeBody')}
          </Txt>
        </View>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
          autoCapitalize="characters"
          autoFocus={!params.code}
          placeholder="ABC123"
          placeholderTextColor={colors.textFaint}
          style={{ height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, fontSize: 28, letterSpacing: 8, textAlign: 'center', color: colors.text, fontFamily: fonts.bold, ...webNoOutline }}
        />
      </View>
      <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg }}>
        <Button title={t('joinTheGame')} icon="enter-outline" disabled={code.length < 6} loading={busy} onPress={join} />
      </View>
    </View>
  );
}
