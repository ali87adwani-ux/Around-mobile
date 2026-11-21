/** All pitches on a map, with your location. Tap a pin to open the pitch. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PitchMap } from '@/components/PitchMap';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, EmptyState, IconButton, Row, Txt } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function MapScreen() {
  const { t, l, money, pitches, userLoc, locate } = useApp();
  const insets = useSafeAreaInsets();
  const located = pitches.filter((p) => p.lat != null && p.lng != null);
  const pins = useMemo(() => located.map((p) => ({ pitch: p, label: l(p.name), sub: money(p.pricePerHour) })), [located, l, money]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('mapTitle')} right={<IconButton icon="locate" label={t('nearMe')} onPress={() => locate()} />} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        {located.length === 0 ? (
          <EmptyState icon="map-outline" title={t('mapEmpty')} />
        ) : Platform.OS === 'web' ? (
          <PitchMap pins={pins} me={userLoc} onOpen={(id) => router.push(`/pitch/${id}`)} openLabel={t('openPitch')} height={460} />
        ) : null}
        {located.map((p) => (
          <Card key={p.id} onPress={() => router.push(`/pitch/${p.id}`)}>
            <Row gap={space.md}>
              <Ionicons name="location" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong" numberOfLines={1}>{l(p.name)}</Txt>
                <Txt v="caption" color={colors.textMuted}>
                  {l(p.area)}
                  {p.distanceKm < 900 ? ` · ${p.distanceKm.toFixed(1)} ${t('km')}` : ''}
                </Txt>
              </View>
              <Button
                title={t('directions')}
                small
                kind="secondary"
                icon="navigate"
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${p.lat},${p.lng}`)}
              />
            </Row>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
