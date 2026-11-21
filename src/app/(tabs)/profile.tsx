import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PitchCard } from '@/components/cards';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { PlayerCard } from '@/components/PlayerCard';
import { Button, Card, Chip, Divider, Field, HScroll, Row, Segmented, Tap, Txt, useDir, type IconName } from '@/components/ui';
import type { Lang, Level, Position } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

export default function Profile() {
  const { t, me, state, dispatch, lang, pitches, myBookings, isOwner, mode, signOut, saveProfile, errText, allMatches, isJoined } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const d = useDir();
  const [edit, setEdit] = useState(false);
  const [reset, setReset] = useState(false);
  const [name, setName] = useState(state.profile.name);
  const [position, setPosition] = useState<Position>(state.profile.position);
  const [level, setLevel] = useState<Level>(state.profile.level);

  const upcomingBookings = myBookings.filter((b) => b.status === 'confirmed').length;
  const joinedCount = allMatches.filter((m) => isJoined(m.id)).length;
  const favs = pitches.filter((p) => state.favorites.includes(p.id));

  const MenuItem = ({ icon, label, value, onPress, color = colors.text }: { icon: IconName; label: string; value?: string; onPress: () => void; color?: string }) => (
    <Tap onPress={onPress} scale={0.99} style={{ paddingVertical: 14 }}>
      <Row gap={space.md}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={19} color={colors.primary} />
        </View>
        <Txt v="bodyStrong" color={color} style={{ flex: 1 }}>
          {label}
        </Txt>
        {value && (
          <View style={{ backgroundColor: colors.primary, borderRadius: radius.pill, minWidth: 24, paddingHorizontal: 7, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="tiny" color={colors.white} center>
              {value}
            </Txt>
          </View>
        )}
        <Ionicons name={d.forward} size={18} color={colors.textFaint} />
      </Row>
    </Tap>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl, gap: space.lg }} showsVerticalScrollIndicator={false}>
      <Row justify="space-between" style={{ paddingHorizontal: space.lg }}>
        <Txt v="h1">{t('myProfile')}</Txt>
        <Button title={t('editProfile')} small kind="ghost" icon="create-outline" onPress={() => setEdit(true)} />
      </Row>

      <View style={{ paddingHorizontal: space.lg }}>
        <PlayerCard player={me} displayName={state.profile.name || undefined} />
      </View>

      <View style={{ paddingHorizontal: space.lg }}>
        <Card style={{ paddingVertical: space.xs }}>
          <MenuItem icon="calendar-outline" label={t('myBookings')} value={upcomingBookings ? String(upcomingBookings) : undefined} onPress={() => router.push('/bookings')} />
          <Divider />
          <MenuItem icon="football-outline" label={t('myGames')} value={joinedCount ? String(joinedCount) : undefined} onPress={() => router.push('/matches')} />
          <Divider />
          <MenuItem icon="podium-outline" label={t('leaderboard')} onPress={() => router.push('/leaderboard')} />
          {isOwner && (
            <>
              <Divider />
              <MenuItem icon="business-outline" label={t('ownerDashboard')} onPress={() => router.push('/owner')} />
            </>
          )}
        </Card>
        {mode === 'demo' && (
          <Tap onPress={() => dispatch({ type: 'setDemoOwner', on: !state.demoOwner })} scale={0.99} style={{ marginTop: space.sm }}>
            <Row gap={space.sm} justify="center">
              <Ionicons name={state.demoOwner ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
              <Txt v="caption" color={colors.textMuted}>
                {t('ownerDemoToggle')}
              </Txt>
            </Row>
          </Tap>
        )}
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <Row gap={8}>
          <Ionicons name="language" size={20} color={colors.primary} />
          <Txt v="h3">{t('language')}</Txt>
        </Row>
        <Segmented<Lang>
          value={lang}
          onChange={(v) => dispatch({ type: 'setLang', lang: v })}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
        />
      </View>

      <View style={{ gap: space.md }}>
        <Txt v="h3" style={{ paddingHorizontal: space.lg }}>
          {t('favorites')}
        </Txt>
        {favs.length === 0 ? (
          <Txt v="caption" color={colors.textMuted} style={{ paddingHorizontal: space.lg }}>
            {t('noFavorites')}
          </Txt>
        ) : (
          <HScroll>
            {favs.map((p) => (
              <PitchCard key={p.id} pitch={p} compact />
            ))}
          </HScroll>
        )}
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' }}>
        <Image source={require('../../../assets/brand/app-icon.png')} style={{ width: 48, height: 48 }} accessibilityLabel={t('appName')} />
        {mode === 'live' ? (
          <Tap onPress={signOut} hitSlop={8}>
            <Txt v="caption" color={colors.danger} center>
              {t('signOut')}
            </Txt>
          </Tap>
        ) : (
          <Tap onPress={() => setReset(true)} hitSlop={8}>
            <Txt v="caption" color={colors.danger} center>
              {t('resetApp')}
            </Txt>
          </Tap>
        )}
        <Txt v="tiny" color={colors.textFaint} center>
          {t('appName')} · {t('version', { v: Constants.expoConfig?.version ?? '1.0.0' })}
        </Txt>
      </View>

      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('editProfile')}>
        <View style={{ gap: space.lg }}>
          <Field label={t('yourName')} value={name} onChangeText={setName} placeholder={t('namePlaceholder')} />
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
          <Button
            title={t('save')}
            disabled={!name.trim()}
            onPress={async () => {
              const r = await saveProfile({ name: name.trim(), position, level });
              if (!r.ok) return toast(errText(r.error), 'error');
              setEdit(false);
              toast(t('save') + ' ✓');
            }}
          />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={reset}
        onClose={() => setReset(false)}
        title={t('resetConfirm')}
        confirmLabel={t('resetApp')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => {
          dispatch({ type: 'reset' });
          setReset(false);
          toast(t('done'), 'info');
        }}
      />
    </ScrollView>
  );
}
