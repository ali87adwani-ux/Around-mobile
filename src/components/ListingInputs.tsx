/** Photo grid and location picker used when owners add or edit a pitch / academy. */
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, TextInput, View } from 'react-native';
import * as api from '@/lib/api';
import { coordsFromLink, currentLocation, type Coords } from '@/lib/location';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';
import { useToast } from './overlays';
import { Button, Row, Tap, Txt, webNoOutline } from './ui';

/** Photos are storage paths; the first one is the cover. */
export function PhotoPicker({ paths, onChange, max = 8 }: { paths: string[]; onChange: (paths: string[]) => void; max?: number }) {
  const { t, meId, mode, errText } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast(t('photoPermission'), 'error');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max - paths.length, quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    if (mode !== 'live') return onChange([...paths, ...res.assets.map((a) => a.uri)].slice(0, max));
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const a of res.assets.slice(0, max - paths.length)) uploaded.push(await api.uploadListingPhoto(meId, a.uri));
      onChange([...paths, ...uploaded]);
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(false);
  };

  const url = (p: string) => (mode === 'live' && !p.startsWith('file:') && !p.startsWith('blob:') && !p.startsWith('data:') ? api.photoUrl(p) : p);
  const size = 96;
  return (
    <View style={{ gap: space.sm }}>
      <Row justify="space-between">
        <Txt v="label" color={colors.textMuted}>
          {t('photos')} ({paths.length}/{max})
        </Txt>
        {paths.length > 0 && <Txt v="tiny" color={colors.textFaint}>{t('firstIsCover')}</Txt>}
      </Row>
      <Row gap={8} wrap>
        {paths.map((p, i) => (
          <View key={p} style={{ width: size, height: size, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted }}>
            <Image source={{ uri: url(p) }} style={{ width: size, height: size }} />
            <Tap onPress={() => onChange(paths.filter((x) => x !== p))} hitSlop={6} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 2 }}>
              <Ionicons name="close" size={16} color="#fff" />
            </Tap>
            {i > 0 && (
              <Tap onPress={() => onChange([p, ...paths.filter((x) => x !== p)])} hitSlop={6} style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Txt v="tiny" color="#fff">{t('makeCover')}</Txt>
              </Tap>
            )}
            {i === 0 && (
              <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Txt v="tiny" color="#fff">{t('cover')}</Txt>
              </View>
            )}
          </View>
        ))}
        {paths.length < max && (
          <Tap onPress={busy ? undefined : add} style={{ width: size, height: size, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="camera-outline" size={26} color={colors.primary} />}
            <Txt v="tiny" color={colors.primary}>{t('addPhotos')}</Txt>
          </Tap>
        )}
      </Row>
    </View>
  );
}

export function LocationPicker({ value, onChange }: { value: Coords | null; onChange: (c: Coords | null) => void }) {
  const { t } = useApp();
  const toast = useToast();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const here = async () => {
    setBusy(true);
    const c = await currentLocation();
    setBusy(false);
    if (!c) return toast(t('locationDenied'), 'error');
    onChange(c);
    toast(t('locationSet'), 'success');
  };

  const fromLink = (v: string) => {
    setLink(v);
    const c = coordsFromLink(v);
    if (c) onChange(c);
  };

  return (
    <View style={{ gap: space.sm }}>
      <Txt v="label" color={colors.textMuted}>{t('pitchLocation')}</Txt>
      <Button title={t('useMyLocation')} kind="secondary" small icon="navigate" loading={busy} onPress={here} />
      <TextInput
        value={link}
        onChangeText={fromLink}
        autoCapitalize="none"
        keyboardType="url"
        placeholder={t('orPasteMapLink')}
        placeholderTextColor={colors.textFaint}
        style={{ height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space.md, fontFamily: fonts.medium, color: colors.text, ...webNoOutline }}
      />
      {link.length > 8 && !coordsFromLink(link) && <Txt v="tiny" color={colors.warning}>{t('shortLinkHint')}</Txt>}
      {value ? (
        <Row gap={6}>
          <Ionicons name="location" size={16} color={colors.success} />
          <Txt v="caption" color={colors.success} style={{ flex: 1 }}>
            {t('locationPinned')} ({value.lat.toFixed(4)}, {value.lng.toFixed(4)})
          </Txt>
          <Tap onPress={() => Linking.openURL(`https://maps.google.com/?q=${value.lat},${value.lng}`)} hitSlop={8}>
            <Txt v="caption" color={colors.primary}>{t('viewOnMap')}</Txt>
          </Tap>
        </Row>
      ) : (
        <Txt v="tiny" color={colors.textFaint}>{t('locationHint')}</Txt>
      )}
    </View>
  );
}
