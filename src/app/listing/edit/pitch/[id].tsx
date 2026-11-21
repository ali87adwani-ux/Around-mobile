/** Edit every detail of a pitch: names, area, address, sizes, surface, location, photos (owner or admin). */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stepper } from '@/components/academy';
import { LocationPicker, PhotoPicker } from '@/components/ListingInputs';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Chip, EmptyState, Field, Row, Txt, haptic } from '@/components/ui';
import type { Governorate, PitchSize } from '@/data/types';
import * as api from '@/lib/api';
import type { Coords } from '@/lib/location';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

const GOVS: Governorate[] = ['capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer'];

export default function EditPitch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, allPitches, errText, refresh, mode, meId, role } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const p = allPitches.find((x) => x.id === id);
  const [nameAr, setNameAr] = useState(p?.name.ar ?? '');
  const [nameEn, setNameEn] = useState(p?.nameEn && p.nameEn !== p.name.ar ? p.nameEn : '');
  const [area, setArea] = useState(p?.area.ar ?? '');
  const [gov, setGov] = useState<Governorate>(p?.governorate ?? 'hawalli');
  const [address, setAddress] = useState(p?.address.ar ?? '');
  const [sizes, setSizes] = useState<PitchSize[]>(p?.sizes ?? [5]);
  const [surface, setSurface] = useState<'artificial' | 'natural'>(p?.surface ?? 'artificial');
  const [indoor, setIndoor] = useState(p?.indoor ?? false);
  const [loc, setLoc] = useState<Coords | null>(p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : null);
  const [photos, setPhotos] = useState<string[]>(p?.photoPaths ?? []);
  const [busy, setBusy] = useState(false);
  const [courts, setCourts] = useState(p?.courts ?? 1);

  if (!p || (p.ownerId !== meId && role !== 'admin')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="lock-closed-outline" title={t('noResults')} />
      </View>
    );
  }

  const toggle = (n: PitchSize) => setSizes(sizes.includes(n) ? sizes.filter((x) => x !== n) : [...sizes, n]);

  const save = async () => {
    if (nameAr.trim().length < 3 || area.trim().length < 2 || !sizes.length) {
      haptic.warn();
      return toast(t('required'), 'error');
    }
    if (mode !== 'live') return toast(errText('live_only'), 'error');
    setBusy(true);
    try {
      await api.updatePitchDetails(p.id, { nameAr: nameAr.trim(), nameEn: nameEn.trim(), area: area.trim(), governorate: gov, address: address.trim(), sizes, surface, indoor, lat: loc?.lat, lng: loc?.lng, photos });
      if (courts !== (p.courts ?? 1)) await api.setPitchCourts(p.id, courts);
      const removed = (p.photoPaths ?? []).filter((x) => !photos.includes(x));
      await api.removeListingPhotos(removed).catch(() => {});
      await refresh();
      haptic.success();
      toast(t('saved'), 'success');
      router.back();
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('editPitch')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <PhotoPicker paths={photos} onChange={setPhotos} />
        <Field label={t('pitchName')} value={nameAr} onChangeText={setNameAr} />
        <Field label={t('nameEnOptional')} value={nameEn} onChangeText={setNameEn} autoCapitalize="words" />
        <Field label={t('pitchArea')} value={area} onChangeText={setArea} />
        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('governorate')}</Txt>
          <Row gap={8} wrap>
            {GOVS.map((g) => (
              <Chip key={g} label={t(`gov_${g}`)} selected={gov === g} onPress={() => setGov(g)} />
            ))}
          </Row>
        </View>
        <Field label={t('pitchAddress')} value={address} onChangeText={setAddress} />
        <LocationPicker value={loc} onChange={setLoc} />
        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('courtsAtVenue')}</Txt>
          <Stepper value={courts} onChange={setCourts} min={1} max={20} format={(v) => t('courtsN', { n: v })} />
        </View>
        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('pitchSizes')}</Txt>
          <Row gap={8} wrap>
            {([5, 6, 7, 11] as PitchSize[]).map((n) => (
              <Chip key={n} label={t('aSide', { n })} selected={sizes.includes(n)} onPress={() => toggle(n)} />
            ))}
          </Row>
        </View>
        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('surfaceType')}</Txt>
          <Row gap={8} wrap>
            <Chip label={t('artificial')} selected={surface === 'artificial'} onPress={() => setSurface('artificial')} />
            <Chip label={t('natural')} selected={surface === 'natural'} onPress={() => setSurface('natural')} />
            <Chip label={t('indoor')} selected={indoor} onPress={() => setIndoor(true)} />
            <Chip label={t('outdoor')} selected={!indoor} onPress={() => setIndoor(false)} />
          </Row>
        </View>
        <Txt v="caption" color={colors.textMuted}>{t('priceHoursInDashboard')}</Txt>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={t('save')} icon="checkmark-circle" loading={busy} onPress={save} />
      </View>
    </View>
  );
}
