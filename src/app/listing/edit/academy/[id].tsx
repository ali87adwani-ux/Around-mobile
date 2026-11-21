/** Edit an academy's names, area, about, location and photos (owner or admin). */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocationPicker, PhotoPicker } from '@/components/ListingInputs';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Chip, EmptyState, Field, Row, Txt, haptic } from '@/components/ui';
import type { Governorate } from '@/data/types';
import * as api from '@/lib/api';
import type { Coords } from '@/lib/location';
import { useAcademies } from '@/store/academies';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

const GOVS: Governorate[] = ['capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer'];

export default function EditAcademy() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errText, mode, meId, role } = useApp();
  const { allAcademies, reload } = useAcademies();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const a = allAcademies.find((x) => x.id === id);
  const [nameAr, setNameAr] = useState(a?.name.ar ?? '');
  const [nameEn, setNameEn] = useState(a?.nameEn && a.nameEn !== a.name.ar ? a.nameEn : '');
  const [area, setArea] = useState(a?.area.ar ?? '');
  const [gov, setGov] = useState<Governorate>((a?.governorate as Governorate) ?? 'hawalli');
  const [about, setAbout] = useState(a?.about.ar ?? '');
  const [loc, setLoc] = useState<Coords | null>(a?.lat != null && a?.lng != null ? { lat: a.lat, lng: a.lng } : null);
  const [photos, setPhotos] = useState<string[]>(a?.photoPaths ?? []);
  const [busy, setBusy] = useState(false);

  if (!a || (a.ownerId !== meId && role !== 'admin')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="lock-closed-outline" title={t('noResults')} />
      </View>
    );
  }

  const save = async () => {
    if (nameAr.trim().length < 3 || area.trim().length < 2) {
      haptic.warn();
      return toast(t('required'), 'error');
    }
    if (mode !== 'live') return toast(errText('live_only'), 'error');
    setBusy(true);
    try {
      await api.updateAcademyDetails(a.id, { nameAr: nameAr.trim(), nameEn: nameEn.trim(), area: area.trim(), governorate: gov, about: about.trim(), lat: loc?.lat, lng: loc?.lng, photos });
      await api.removeListingPhotos((a.photoPaths ?? []).filter((x) => !photos.includes(x))).catch(() => {});
      await reload();
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
      <ScreenHeader title={t('editAcademy')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <PhotoPicker paths={photos} onChange={setPhotos} />
        <Field label={t('academyName')} value={nameAr} onChangeText={setNameAr} />
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
        <LocationPicker value={loc} onChange={setLoc} />
        <Field label={t('academyAbout')} value={about} onChangeText={setAbout} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={t('save')} icon="checkmark-circle" loading={busy} onPress={save} />
      </View>
    </View>
  );
}
