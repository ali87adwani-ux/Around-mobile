/** Join a tournament team with the captain's invite code (also opened from shared links). */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Txt, haptic, webNoOutline } from '@/components/ui';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';

export default function JoinTeam() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { t, errText, mode, refresh } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);

  const join = async () => {
    if (mode !== 'live') return toast(errText('live_only'), 'error');
    setBusy(true);
    try {
      const teamId = await api.joinTeamByCode(code);
      await refresh();
      haptic.success();
      toast(t('joinedTeam'), 'success');
      router.replace(`/tournament/team/${teamId}`);
    } catch (e) {
      haptic.warn();
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('joinWithCode')} />
      <View style={{ padding: space.xl, gap: space.xl, flex: 1 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="key" size={30} color={colors.primary} />
        </View>
        <View style={{ gap: 6 }}>
          <Txt v="display">{t('joinWithCode')}</Txt>
          <Txt v="body" color={colors.textMuted}>
            {t('joinWithCodeBody')}
          </Txt>
        </View>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
          autoCapitalize="characters"
          autoFocus
          placeholder="ABC123"
          placeholderTextColor={colors.textFaint}
          style={{ height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, fontSize: 28, letterSpacing: 8, textAlign: 'center', color: colors.text, fontFamily: fonts.bold, ...webNoOutline }}
        />
      </View>
      <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg }}>
        <Button title={t('joinTeam')} icon="enter-outline" disabled={code.length < 6} loading={busy} onPress={join} />
      </View>
    </View>
  );
}
