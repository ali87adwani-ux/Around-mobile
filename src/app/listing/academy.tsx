/** Academy owners list their academy. It goes live after an admin approves it. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocationPicker, PhotoPicker } from '@/components/ListingInputs';
import { useToast } from '@/components/overlays';
import type { Coords } from '@/lib/location';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, Chip, Field, Row, Txt, haptic } from '@/components/ui';
import type { Governorate } from '@/data/types';
import { useAcademies } from '@/store/academies';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

const GOVS: Governorate[] = ['capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer'];

export default function NewAcademyListing() {
  const { t, errText } = useApp();
  const { submitAcademy } = useAcademies();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [gov, setGov] = useState<Governorate>('hawalli');
  const [about, setAbout] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loc, setLoc] = useState<Coords | null>(null);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const phoneOk = phone.replace(/\D/g, '').length >= 8;
  const valid = name.trim().length >= 3 && area.trim().length >= 2 && phoneOk;

  const submit = async () => {
    setTried(true);
    if (!valid) {
      haptic.warn();
      return;
    }
    setBusy(true);
    const r = await submitAcademy({ name: name.trim(), nameEn: nameEn.trim(), photos, lat: loc?.lat, lng: loc?.lng, area: area.trim(), governorate: gov, about: about.trim(), phone: phone.trim(), note: note.trim() });
    setBusy(false);
    if (!r.ok) return toast(errText(r.error), 'error');
    haptic.success();
    toast(t('academyListingSent'), 'success');
    router.replace('/listings');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('listAcademy')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <Card flat style={{ backgroundColor: colors.primarySoft, gap: 6 }}>
          <Row gap={8}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Txt v="bodyStrong" color={colors.primary} style={{ flex: 1 }}>
              {t('listingHowTitle')}
            </Txt>
          </Row>
          <Txt v="caption" color={colors.textMuted}>
            {t('academyHowBody')}
          </Txt>
        </Card>

        <Field label={t('academyName')} placeholder={t('academyNamePh')} value={name} onChangeText={setName} error={tried && name.trim().length < 3 ? t('required') : undefined} />
        <Field label={t('nameEnOptional')} placeholder="e.g. Stars Football Academy" value={nameEn} onChangeText={setNameEn} autoCapitalize="words" />
        <PhotoPicker paths={photos} onChange={setPhotos} />
        <Field label={t('pitchArea')} placeholder={t('pitchAreaPh')} value={area} onChangeText={setArea} error={tried && area.trim().length < 2 ? t('required') : undefined} />

        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('governorate')}</Txt>
          <Row gap={8} wrap>
            {GOVS.map((g) => (
              <Chip key={g} label={t(`gov_${g}`)} selected={gov === g} onPress={() => setGov(g)} />
            ))}
          </Row>
        </View>

        <LocationPicker value={loc} onChange={setLoc} />
        <Field label={t('academyAbout')} placeholder={t('academyAboutPh')} value={about} onChangeText={setAbout} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
        <Field
          label={t('contactPhone')}
          placeholder="5xxxxxxx"
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/[^\d+ ]/g, '').slice(0, 16))}
          keyboardType="phone-pad"
          error={tried && !phoneOk ? t('required') : undefined}
        />
        <Txt v="tiny" color={colors.textFaint} style={{ marginTop: -space.sm }}>
          {t('contactPhoneHint')}
        </Txt>
        <Field label={t('listingNote')} placeholder={t('academyNotePh')} value={note} onChangeText={setNote} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={t('sendForReview')} icon="paper-plane" loading={busy} onPress={submit} />
      </View>
    </View>
  );
}
