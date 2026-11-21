import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PitchCard } from '@/components/cards';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { PlayerCard } from '@/components/PlayerCard';
import { Button, Card, Chip, Divider, Field, HScroll, Row, Segmented, Tap, Txt, useDir, type IconName } from '@/components/ui';
import type { Lang, Level, Position } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { useSupport } from '@/store/support';
import { useAcademies } from '@/store/academies';
import { colors, radius, space } from '@/theme';

export default function Profile() {
  const { t, me, state, dispatch, lang, pitches, myBookings, isOwner, mode, signOut, saveProfile, errText, allMatches, isJoined, setAvatar, removeAvatar, role } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const d = useDir();
  const [edit, setEdit] = useState(false);
  const [reset, setReset] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const pickPhoto = async (source: 'camera' | 'library') => {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast(t('photoPermission'), 'error');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    setPhotoSheet(false);
    setPhotoBusy(true);
    const r = await setAvatar(res.assets[0].uri);
    setPhotoBusy(false);
    toast(r.ok ? t('photoSaved') : errText(r.error), r.ok ? 'success' : 'error');
  };

  const deletePhoto = async () => {
    setPhotoSheet(false);
    const r = await removeAvatar();
    toast(r.ok ? t('photoRemoved') : errText(r.error), r.ok ? 'info' : 'error');
  };
  const [name, setName] = useState(state.profile.name);
  const [position, setPosition] = useState<Position>(state.profile.position);
  const [level, setLevel] = useState<Level>(state.profile.level);

  const upcomingBookings = myBookings.filter((b) => b.status === 'confirmed').length;
  const joinedCount = allMatches.filter((m) => isJoined(m.id)).length;
  const { tickets } = useSupport();
  const { ownedAcademies } = useAcademies();
  const openTickets = tickets.filter((tk) => tk.status === 'answered').length;
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
        <PlayerCard player={me} displayName={state.profile.name || undefined} onEditPhoto={() => setPhotoSheet(true)} />
      </View>

      <View style={{ paddingHorizontal: space.lg }}>
        <Card style={{ paddingVertical: space.xs }}>
          <MenuItem icon="calendar-outline" label={t('myBookings')} value={upcomingBookings ? String(upcomingBookings) : undefined} onPress={() => router.push('/bookings')} />
          <Divider />
          <MenuItem icon="football-outline" label={t('myGames')} value={joinedCount ? String(joinedCount) : undefined} onPress={() => router.push('/matches')} />
          <Divider />
          <MenuItem icon="podium-outline" label={t('leaderboard')} onPress={() => router.push('/leaderboard')} />
          <Divider />
          <MenuItem icon="school-outline" label={t('academies')} onPress={() => router.push('/academies')} />
          <Divider />
          <MenuItem icon="headset-outline" label={t('support')} value={openTickets ? String(openTickets) : undefined} onPress={() => router.push('/support')} />
          {isOwner && (
            <>
              <Divider />
              <MenuItem icon="business-outline" label={t('ownerDashboard')} onPress={() => router.push('/owner')} />
            </>
          )}
          {ownedAcademies.length > 0 && (
            <>
              <Divider />
              <MenuItem icon="ribbon-outline" label={t('academyDashboard')} onPress={() => router.push('/academy-admin')} />
            </>
          )}
          {role === 'admin' && (
            <>
              <Divider />
              <MenuItem icon="shield-checkmark-outline" label={t('adminDashboard')} onPress={() => router.push('/admin')} />
            </>
          )}
        </Card>
        {mode === 'demo' && (
          <View style={{ marginTop: space.sm, gap: 4 }}>
            {([
              ['ownerDemoToggle', state.demoOwner, () => dispatch({ type: 'setDemoOwner', on: !state.demoOwner })],
              ['academyDemoToggle', state.demoAcademy, () => dispatch({ type: 'setDemoRole', key: 'demoAcademy', on: !state.demoAcademy })],
              ['adminDemoToggle', state.demoAdmin, () => dispatch({ type: 'setDemoRole', key: 'demoAdmin', on: !state.demoAdmin })],
            ] as const).map(([label, on, toggle]) => (
              <Tap key={label} onPress={toggle} scale={0.99} style={{ paddingVertical: 4 }}>
                <Row gap={space.sm} justify="center">
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
                  <Txt v="caption" color={colors.textMuted}>
                    {t(label)}
                  </Txt>
                </Row>
              </Tap>
            ))}
          </View>
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

      <Sheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title={t('profilePhoto')}>
        <View style={{ gap: space.sm }}>
          {Platform.OS !== 'web' && <Button title={t('takePhoto')} icon="camera" onPress={() => pickPhoto('camera')} />}
          <Button title={state.profile.avatarUrl ? t('changePhoto') : t('choosePhoto')} icon="images" kind={Platform.OS === 'web' ? 'primary' : 'secondary'} onPress={() => pickPhoto('library')} />
          {state.profile.avatarUrl && <Button title={t('removePhoto')} icon="trash" kind="danger" onPress={deletePhoto} />}
          <Button title={t('cancel')} kind="ghost" onPress={() => setPhotoSheet(false)} />
        </View>
      </Sheet>
      {photoBusy && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      )}

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
