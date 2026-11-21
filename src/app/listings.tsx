/** Pitches and academies the user listed, with their review state. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListingStatus } from '@/components/ListingStatus';
import { ConfirmSheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, Row, Tap, Txt, useDir, type IconName } from '@/components/ui';
import { formatHour } from '@/i18n/format';
import type { StringKey } from '@/i18n/strings';
import { useAcademies } from '@/store/academies';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

function AddCard({ icon, title, body, onPress }: { icon: IconName; title: string; body: string; onPress: () => void }) {
  const d = useDir();
  return (
    <Card onPress={onPress}>
      <Row gap={space.md}>
        <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{title}</Txt>
          <Txt v="caption" color={colors.textMuted}>
            {body}
          </Txt>
        </View>
        <Ionicons name={d.forward} size={18} color={colors.textFaint} />
      </Row>
    </Card>
  );
}

export default function Listings() {
  const { t, l, lang, money, myListings, withdrawPitch, errText, refresh } = useApp();
  const { myAcademyListings, withdrawAcademy, reload } = useAcademies();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [withdraw, setWithdraw] = useState<{ kind: 'pitch' | 'academy'; id: string } | null>(null);
  useEffect(() => {
    refresh();
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = myListings.length === 0 && myAcademyListings.length === 0;

  const hint = (status?: string) =>
    status === 'pending' ? (
      <Txt v="caption" color={colors.textMuted}>
        {t('listingPendingHint')}
      </Txt>
    ) : status === 'rejected' ? (
      <Txt v="caption" color={colors.danger}>
        {t('listingRejectedHint')}
      </Txt>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('myListings')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        {empty && (
          <View style={{ gap: 6, paddingVertical: space.md }}>
            <Txt v="h2">{t('noListings')}</Txt>
            <Txt v="body" color={colors.textMuted}>
              {t('noListingsSub')}
            </Txt>
          </View>
        )}

        {myListings.length > 0 && <Txt v="h3">{t('myPitches')}</Txt>}
        {myListings.map((p) => (
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
            {hint(p.status)}
            {(p.status ?? 'approved') === 'approved' ? (
              <Button title={t('ownerDashboard')} small icon="speedometer-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/owner')} />
            ) : (
              <Button title={t('withdrawListing')} small kind="danger" icon="trash-outline" style={{ alignSelf: 'flex-start' }} onPress={() => setWithdraw({ kind: 'pitch', id: p.id })} />
            )}
          </Card>
        ))}

        {myAcademyListings.length > 0 && <Txt v="h3">{t('myAcademies')}</Txt>}
        {myAcademyListings.map((a) => (
          <Card key={a.id} style={{ gap: space.sm }}>
            <Row justify="space-between" gap={space.sm}>
              <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
                {l(a.name)}
              </Txt>
              <ListingStatus status={a.status} />
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {l(a.area)} · {t(`gov_${a.governorate}` as StringKey)}
            </Txt>
            {hint(a.status)}
            {a.status === 'approved' ? (
              <Button title={t('academyDashboard')} small icon="speedometer-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/academy-admin')} />
            ) : (
              <Button title={t('withdrawListing')} small kind="danger" icon="trash-outline" style={{ alignSelf: 'flex-start' }} onPress={() => setWithdraw({ kind: 'academy', id: a.id })} />
            )}
          </Card>
        ))}

        {[...myListings, ...myAcademyListings].some((x) => x.status === 'approved') && (
          <Button title={t('billingTitle')} kind="secondary" icon="card-outline" onPress={() => router.push('/billing')} />
        )}
        <Txt v="h3" style={{ marginTop: space.sm }}>
          {empty ? t('whatToList') : t('addMore')}
        </Txt>
        <AddCard icon="football-outline" title={t('listPitch')} body={t('listPitchSub')} onPress={() => router.push('/listing/new')} />
        <AddCard icon="school-outline" title={t('listAcademy')} body={t('listAcademySub')} onPress={() => router.push('/listing/academy')} />
        <Tap onPress={() => router.push('/support')} style={{ alignSelf: 'center', paddingVertical: space.sm }}>
          <Txt v="caption" color={colors.primary}>
            {t('listingQuestions')}
          </Txt>
        </Tap>
      </ScrollView>
      <ConfirmSheet
        visible={!!withdraw}
        onClose={() => setWithdraw(null)}
        title={t('withdrawConfirm')}
        confirmLabel={t('withdrawListing')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={async () => {
          const w = withdraw!;
          setWithdraw(null);
          const r = w.kind === 'pitch' ? await withdrawPitch(w.id) : await withdrawAcademy(w.id);
          toast(r.ok ? t('done') : errText(r.error), r.ok ? 'info' : 'error');
        }}
      />
    </View>
  );
}
