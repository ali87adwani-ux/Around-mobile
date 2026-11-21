/** The pitches the user listed, with their review state. */
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListingStatus } from '@/components/ListingStatus';
import { ConfirmSheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, EmptyState, IconButton, Row, Txt } from '@/components/ui';
import { formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function Listings() {
  const { t, l, lang, money, myListings, withdrawPitch, errText, isOwner, refresh } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [withdraw, setWithdraw] = useState<string | null>(null);
  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('myPitches')} right={<IconButton icon="add" label={t('listPitch')} onPress={() => router.push('/listing/new')} />} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        {myListings.length === 0 ? (
          <EmptyState icon="business-outline" title={t('noListings')} body={t('noListingsSub')} action={t('listPitch')} onAction={() => router.push('/listing/new')} />
        ) : (
          myListings.map((p) => (
            <Card key={p.id} style={{ gap: space.sm }}>
              <Row justify="space-between" gap={space.sm}>
                <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
                  {l(p.name)}
                </Txt>
                <ListingStatus status={p.status} />
              </Row>
              <Txt v="caption" color={colors.textMuted}>
                {l(p.area)} · {t(`gov_${p.governorate}`)} · {money(p.pricePerHour)}
                {t('perHour')} · {t('openHours', { from: formatHour(p.openFrom, lang), to: formatHour(p.openTo % 24, lang) })}
              </Txt>
              {p.status === 'pending' && (
                <Txt v="caption" color={colors.textMuted}>
                  {t('listingPendingHint')}
                </Txt>
              )}
              {p.status === 'rejected' && (
                <Txt v="caption" color={colors.danger}>
                  {t('listingRejectedHint')}
                </Txt>
              )}
              <Row gap={space.sm}>
                {(p.status ?? 'approved') === 'approved' ? (
                  <Button title={t('ownerDashboard')} small icon="speedometer-outline" onPress={() => router.push('/owner')} />
                ) : (
                  <Button title={t('withdrawListing')} small kind="danger" icon="trash-outline" onPress={() => setWithdraw(p.id)} />
                )}
              </Row>
            </Card>
          ))
        )}
        {myListings.length > 0 && <Button title={t('listAnotherPitch')} kind="ghost" icon="add" onPress={() => router.push('/listing/new')} />}
        {isOwner && myListings.length === 0 && <Button title={t('ownerDashboard')} kind="secondary" onPress={() => router.push('/owner')} />}
      </ScrollView>
      <ConfirmSheet
        visible={!!withdraw}
        onClose={() => setWithdraw(null)}
        title={t('withdrawConfirm')}
        confirmLabel={t('withdrawListing')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={async () => {
          const id = withdraw!;
          setWithdraw(null);
          const r = await withdrawPitch(id);
          toast(r.ok ? t('done') : errText(r.error), r.ok ? 'info' : 'error');
        }}
      />
    </View>
  );
}
