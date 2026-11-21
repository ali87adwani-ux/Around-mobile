import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, View, RefreshControl } from 'react-native';
import { ConfirmSheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, Card, EmptyState, PitchArt, Row, Segmented, Txt } from '@/components/ui';
import { formatDay, formatDuration, formatHour, fromISODate, offsetOf } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { useInviteFriends } from '@/store/inviteFriends';
import { bookingPhase } from '@/lib/matchPhase';
import { addToCalendar } from '@/lib/calendar';
import { cancelInfo } from '@/lib/policy';
import { colors, space } from '@/theme';

export default function Bookings() {
  const { t, l, lang, money, myBookings, getPitch, cancelBooking, errText, refresh, mode, loading } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const friends = useInviteFriends();
  const labels = { today: t('today'), tomorrow: t('tomorrow') };

  // A booking moves to "Past" as soon as its time is over, not at midnight.
  const isUpcoming = (b: { dateISO: string; hour: number; duration: number; status: string }) => b.status === 'confirmed' && bookingPhase(b) !== 'ended';
  const list = myBookings
    .filter((b) => (tab === 'upcoming' ? isUpcoming(b) : !isUpcoming(b)))
    .sort((a, b) => (a.dateISO + String(a.hour).padStart(2, '0')).localeCompare(b.dateISO + String(b.hour).padStart(2, '0')) * (tab === 'upcoming' ? 1 : -1));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('myBookings')} />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: t('upcoming') },
            { value: 'past', label: t('past') },
          ]}
        />
      </View>
      <FlatList
        refreshControl={mode === 'live' ? <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} /> : undefined}
        data={list}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md }}
        ListEmptyComponent={<EmptyState icon="calendar-outline" title={t('noBookings')} body={t('noBookingsSub')} action={t('bookBrowse')} onAction={() => router.push('/pitches')} />}
        renderItem={({ item: b }) => {
          const p = getPitch(b.pitchId);
          const cancelled = b.status === 'cancelled';
          const phase = bookingPhase(b);
          return (
            <Card style={{ gap: space.md, opacity: cancelled ? 0.65 : 1 }} onPress={() => router.push(`/pitch/${p.id}`)}>
              <Row gap={space.md}>
                <PitchArt tint={p.tint} photo={p.photos?.[0]} height={64} style={{ width: 64 }} radiusSize={14}>
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="football" size={24} color={colors.white} />
                  </View>
                </PitchArt>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="h3" numberOfLines={1}>
                    {l(p.name)}
                  </Txt>
                  <Txt v="caption" color={colors.textMuted}>
                    {formatDay(fromISODate(b.dateISO), lang, labels)} · {formatHour(b.hour, lang)}
                  </Txt>
                  <Txt v="caption" color={colors.textMuted}>
                    {`${b.size}×${b.size}`} · {formatDuration(b.duration, lang)}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Txt v="h3" color={colors.primary}>
                    {money(b.total)}
                  </Txt>
                  {cancelled ? (
                    <Badge label={t('cancelled')} color={colors.danger} bg={colors.dangerSoft} />
                  ) : phase === 'live' ? (
                    <Badge label={t('liveNow')} icon="radio-button-on" color={colors.success} bg={colors.successSoft} />
                  ) : phase === 'ended' ? (
                    <Badge label={t('gameEnded')} icon="flag" color={colors.textMuted} bg={colors.surfaceMuted} />
                  ) : null}
                </View>
              </Row>
              {tab === 'upcoming' && !cancelled && phase === 'upcoming' && (
                <Row gap={space.sm}>
                  <Button
                    title={t('inviteFriends')}
                    icon="people"
                    small
                    loading={friends.busy === b.id}
                    style={{ flex: 1.3 }}
                    onPress={async () => {
                      const r = await friends.invite(b);
                      if (!r.ok) toast(errText(r.error), 'error');
                    }}
                  />
                  <Button title={t('cancelBooking')} kind="danger" small style={{ flex: 1 }} onPress={() => setCancelId(b.id)} />
                </Row>
              )}
              {tab === 'upcoming' && !cancelled && phase === 'upcoming' && (
                <Button
                  title={t('addToCalendar')}
                  icon="calendar-outline"
                  kind="ghost"
                  small
                  onPress={() => {
                    const start = fromISODate(b.dateISO).getTime() + b.hour * 3600000;
                    addToCalendar({ title: `⚽ ${l(p.name)} (${b.size}×${b.size})`, start, end: start + b.duration * 3600000, location: `${l(p.area)} — ${l(p.address)}`, details: `${t('appName')} · ${money(b.total)}` }).catch(() => {});
                  }}
                />
              )}
            </Card>
          );
        }}
      />
      <ConfirmSheet
        visible={!!cancelId}
        onClose={() => setCancelId(null)}
        title={t('cancelBookingConfirm')}
        body={(() => {
          const b = myBookings.find((x) => x.id === cancelId);
          if (!b) return t('cancelBookingSub');
          const info = cancelInfo(getPitch(b.pitchId), b);
          return info.late ? t('lateCancelBody', { hours: info.hours, pct: info.refundPct }) : t('freeCancelBody', { hours: info.hours });
        })()}
        confirmLabel={t('cancelBooking')}
        cancelLabel={t('back')}
        danger
        onConfirm={async () => {
          const id = cancelId;
          setCancelId(null);
          if (!id) return;
          const r = await cancelBooking(id);
          if (r.ok) toast(t('bookingCancelled'), 'info');
          else toast(errText(r.error), 'error');
        }}
      />
    </View>
  );
}
