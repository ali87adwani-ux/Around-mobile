/** Pitch owners list their pitch. It goes live after an admin approves it. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stepper } from '@/components/academy';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, Chip, Field, Row, Txt, haptic } from '@/components/ui';
import type { Amenity, Governorate, PitchSize } from '@/data/types';
import { formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

const GOVS: Governorate[] = ['capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer'];
const AMENITIES: Amenity[] = ['parking', 'lights', 'showers', 'changing', 'ac', 'balls', 'cafe', 'wifi'];

export default function NewListing() {
  const { t, lang, money, submitPitch, errText } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [gov, setGov] = useState<Governorate>('hawalli');
  const [address, setAddress] = useState('');
  const [mapLink, setMapLink] = useState('');
  const [price, setPrice] = useState(12);
  const [sizes, setSizes] = useState<PitchSize[]>([5]);
  const [surface, setSurface] = useState<'artificial' | 'natural'>('artificial');
  const [indoor, setIndoor] = useState(false);
  const [amenities, setAmenities] = useState<Amenity[]>(['parking', 'lights']);
  const [openFrom, setOpenFrom] = useState(16);
  const [openTo, setOpenTo] = useState(24);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const phoneOk = phone.replace(/\D/g, '').length >= 8;
  const valid = name.trim().length >= 3 && area.trim().length >= 2 && sizes.length > 0 && phoneOk && openTo > openFrom;

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Accepts a Google Maps link and pulls the coordinates out of it, when present.
  const coords = (): { lat?: number; lng?: number } => {
    const m = mapLink.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/) ?? mapLink.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : {};
  };

  const submit = async () => {
    setTried(true);
    if (!valid) {
      haptic.warn();
      return;
    }
    setBusy(true);
    const r = await submitPitch({
      name: name.trim(), area: area.trim(), governorate: gov, address: [address.trim(), mapLink.trim()].filter(Boolean).join(' · '),
      price, sizes, surface, indoor, amenities, openFrom, openTo, phone: phone.trim(), note: note.trim(), ...coords(),
    });
    setBusy(false);
    if (!r.ok) return toast(errText(r.error), 'error');
    haptic.success();
    toast(t('listingSent'), 'success');
    router.replace('/listings');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('listPitch')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <Card flat style={{ backgroundColor: colors.primarySoft, gap: 6 }}>
          <Row gap={8}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Txt v="bodyStrong" color={colors.primary} style={{ flex: 1 }}>
              {t('listingHowTitle')}
            </Txt>
          </Row>
          <Txt v="caption" color={colors.textMuted}>
            {t('listingHowBody')}
          </Txt>
        </Card>

        <Field label={t('pitchName')} placeholder={t('pitchNamePh')} value={name} onChangeText={setName} error={tried && name.trim().length < 3 ? t('required') : undefined} />
        <Field label={t('pitchArea')} placeholder={t('pitchAreaPh')} value={area} onChangeText={setArea} error={tried && area.trim().length < 2 ? t('required') : undefined} />

        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('governorate')}</Txt>
          <Row gap={8} wrap>
            {GOVS.map((g) => (
              <Chip key={g} label={t(`gov_${g}`)} selected={gov === g} onPress={() => setGov(g)} />
            ))}
          </Row>
        </View>

        <Field label={t('pitchAddress')} placeholder={t('pitchAddressPh')} value={address} onChangeText={setAddress} />
        <Field label={t('mapLink')} placeholder="https://maps.google.com/…" value={mapLink} onChangeText={setMapLink} autoCapitalize="none" keyboardType="url" />

        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('pricePerHour')}</Txt>
          <Stepper value={price} onChange={setPrice} min={3} max={200} step={0.5} format={(v) => money(v)} />
        </View>

        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('pitchSizes')}</Txt>
          <Row gap={8} wrap>
            {([5, 7, 11] as PitchSize[]).map((n) => (
              <Chip key={n} label={t('aSide', { n })} selected={sizes.includes(n)} onPress={() => setSizes(toggle(sizes, n))} />
            ))}
          </Row>
          {tried && sizes.length === 0 && <Txt v="caption" color={colors.danger}>{t('required')}</Txt>}
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

        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('amenities')}</Txt>
          <Row gap={8} wrap>
            {AMENITIES.map((a) => (
              <Chip key={a} label={t(`amenity_${a}`)} selected={amenities.includes(a)} onPress={() => setAmenities(toggle(amenities, a))} />
            ))}
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>{t('openingHours')}</Txt>
          <Row gap={space.sm}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="tiny" color={colors.textFaint}>{t('opensAt')}</Txt>
              <Stepper value={openFrom} onChange={(v) => setOpenFrom(Math.min(v, openTo - 1))} min={0} max={23} format={(v) => formatHour(v, lang)} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="tiny" color={colors.textFaint}>{t('closesAt')}</Txt>
              <Stepper value={openTo} onChange={(v) => setOpenTo(Math.max(v, openFrom + 1))} min={1} max={24} format={(v) => formatHour(v % 24, lang)} />
            </View>
          </Row>
        </View>

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
        <Field label={t('listingNote')} placeholder={t('listingNotePh')} value={note} onChangeText={setNote} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={t('sendForReview')} icon="paper-plane" loading={busy} onPress={submit} />
      </View>
    </View>
  );
}
