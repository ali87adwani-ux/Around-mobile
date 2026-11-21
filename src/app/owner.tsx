import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Sheet, useToast } from '@/components/overlays';
import * as api from '@/lib/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Field, Badge, Button, Card, Chip, Divider, EmptyState, HScroll, IconButton, Row, Segmented, Stat, Tap, Txt, haptic, type IconName } from '@/components/ui';
import { Stepper } from '@/components/academy';
import type { Amenity } from '@/data/types';
import type { ReportDay } from '@/lib/api';
import { dateFromOffset, formatDay, formatHour, fromISODate, toISODate, weekdayShort } from '@/i18n/format';
import { useApp, type OwnerSlot } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

export default function OwnerDashboard() {
  const { t, l, lang, money, ownerPitches, ownerDay, ownerBlock, ownerUnblock, ownerUpdatePrice, errText, mode } = useApp();
  const [tab, setTab] = useState<'schedule' | 'reports' | 'settings'>('schedule');
  const toast = useToast();
  const [pitchId, setPitchId] = useState(ownerPitches[0]?.id);
  const pitch = ownerPitches.find((p) => p.id === pitchId) ?? ownerPitches[0];
  const [dayOff, setDayOff] = useState(0);
  const iso = toISODate(dateFromOffset(dayOff));
  const [slots, setSlots] = useState<OwnerSlot[] | null>(null);
  const [price, setPrice] = useState(pitch?.pricePerHour ?? 0);
  const [busyHour, setBusyHour] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [actionSlot, setActionSlot] = useState<OwnerSlot | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => setPrice(pitch?.pricePerHour ?? 0), [pitch?.id, pitch?.pricePerHour]);

  // Reloads whenever the day, the pitch or the data changes. Stale responses are ignored.
  useEffect(() => {
    if (!pitch) return;
    let alive = true;
    ownerDay(pitch.id, iso)
      .then((rows) => alive && setSlots(rows))
      .catch(() => {
        if (!alive) return;
        setSlots([]);
        toast(errText('unknown'), 'error');
      });
    return () => {
      alive = false;
    };
  }, [pitch?.id, iso, ownerDay, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => setSlots(null), [pitch?.id, iso]);

  const rows = useMemo(() => {
    if (!pitch || !slots) return [];
    const out: { hour: number; slot?: OwnerSlot; covered?: boolean }[] = [];
    for (let h = pitch.openFrom; h < pitch.openTo; h++) {
      const slot = slots.find((s) => Math.floor(s.hour) === h);
      const covered = !slot && slots.some((s) => h > s.hour && h < s.hour + s.duration);
      out.push({ hour: h, slot, covered });
    }
    return out;
  }, [pitch, slots]);

  if (!pitch) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('ownerDashboard')} />
        <EmptyState icon="business-outline" title={t('ownerNoPitches')} body={t('ownerNoPitchesSub')} action={t('listPitch')} onAction={() => router.push('/listings')} />
      </View>
    );
  }

  const booked = (slots ?? []).filter((s) => s.status === 'confirmed');
  const revenue = booked.reduce((sum, s) => sum + s.total, 0);
  const openHours = pitch.openTo - pitch.openFrom;
  const usedHours = (slots ?? []).reduce((sum, s) => sum + s.duration, 0);
  const pastHour = dayOff === 0 ? new Date().getHours() : -1;

  const toggle = async (hour: number, slot?: OwnerSlot) => {
    setBusyHour(hour);
    const r = slot ? await ownerUnblock(slot.id) : await ownerBlock(pitch.id, iso, hour);
    setBusyHour(null);
    if (!r.ok) return toast(errText(r.error), 'error');
    haptic.success();
    toast(slot ? t('unblockedToast') : t('blockedToast'), 'info');
    load();
  };

  const savePrice = async () => {
    const r = await ownerUpdatePrice(pitch.id, price);
    if (!r.ok) return toast(errText(r.error), 'error');
    toast(t('priceSaved'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('ownerDashboard')} right={<Row gap={6}><IconButton icon="card-outline" label={t('billingTitle')} onPress={() => router.push('/billing')} /><IconButton icon="trophy-outline" label={t('myTournaments')} onPress={() => router.push('/tournament/mine')} /></Row>} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        {mode === 'demo' && <Badge label={t('demoMode')} icon="information-circle" color={colors.info} bg={colors.infoSoft} />}

        {ownerPitches.length > 1 && (
          <View style={{ marginHorizontal: -space.lg }}>
            <HScroll gap={8}>
              {ownerPitches.map((p) => (
                <Chip key={p.id} label={l(p.name)} selected={p.id === pitch.id} onPress={() => setPitchId(p.id)} />
              ))}
            </HScroll>
          </View>
        )}

        <Txt v="h1">{l(pitch.name)}</Txt>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'schedule', label: t('tabSchedule') },
            { value: 'reports', label: t('tabReports') },
            { value: 'settings', label: t('tabSettings') },
          ]}
        />

        {tab === 'reports' && <Reports pitchId={pitch.id} />}
        {tab === 'settings' && (
          <>
            <Button title={t('editPitchDetails')} kind="secondary" icon="images-outline" onPress={() => router.push(`/listing/edit/pitch/${pitch.id}`)} />
            <Settings pitchId={pitch.id} price={price} setPrice={setPrice} savePrice={savePrice} />
          </>
        )}

        {tab === 'schedule' && (
        <>
        {/* Day */}
        <View style={{ marginHorizontal: -space.lg }}>
          <HScroll gap={8}>
            {Array.from({ length: 14 }).map((_, i) => {
              const d = dateFromOffset(i);
              const sel = i === dayOff;
              return (
                <Tap key={i} onPress={() => setDayOff(i)} style={{ width: 58, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: sel ? colors.primary : colors.card, borderWidth: 1, borderColor: sel ? colors.primary : colors.border }}>
                  <Txt v="tiny" color={sel ? colors.accent : colors.textMuted} center>
                    {i === 0 ? t('today') : weekdayShort(d, lang)}
                  </Txt>
                  <Txt v="h3" color={sel ? colors.white : colors.text} center>
                    {d.getDate()}
                  </Txt>
                </Tap>
              );
            })}
          </HScroll>
        </View>

        {/* Summary */}
        <Card>
          <Row>
            <Stat icon="calendar" value={booked.length} label={t('todayBookings')} />
            <Stat icon="cash" value={money(revenue)} label={t('revenue')} color={colors.success} />
            <Stat icon="pie-chart" value={`${Math.round((usedHours / openHours) * 100)}%`} label={t('occupancy')} color={colors.info} />
          </Row>
        </Card>

        {/* Schedule */}
        <Card style={{ paddingVertical: space.sm }}>
          {!slots ? (
            <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} />
          ) : (
            rows.map(({ hour, slot, covered }, i) => {
              const past = hour < pastHour;
              return (
                <View key={hour}>
                  <Row gap={space.md} style={{ paddingVertical: 12, opacity: past ? 0.45 : 1 }}>
                    <Txt v="label" color={colors.textMuted} style={{ width: 74 }}>
                      {formatHour(hour, lang)}
                    </Txt>
                    <View style={{ flex: 1, gap: 2 }}>
                      {slot?.status === 'confirmed' || covered ? (
                        <>
                          <Row gap={6}>
                            <Ionicons name="person-circle" size={18} color={colors.primary} />
                            <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                              {slot ? (slot.playerName ? t('bookedBy', { name: slot.playerName }) : t('appBooking')) : t('appBooking')}
                            </Txt>
                          </Row>
                          {slot && (
                            <Txt v="tiny" color={slot.noShow ? colors.danger : colors.textMuted}>
                              {money(slot.total)}
                              {slot.noShow ? ` · ${t('noShowMarked')}` : ''}
                            </Txt>
                          )}
                        </>
                      ) : slot?.status === 'blocked' ? (
                        <Badge label={t('blocked')} icon="lock-closed" color={colors.danger} bg={colors.dangerSoft} />
                      ) : (
                        <Badge label={t('free')} icon="ellipse-outline" color={colors.success} bg={colors.successSoft} />
                      )}
                    </View>
                    {slot?.status === 'confirmed' && mode === 'live' && slot.total > 0 && (
                      <IconButton icon="ellipsis-horizontal" label={t('bookingActions')} size={36} onPress={() => setActionSlot(slot)} />
                    )}
                    {!past && !covered && slot?.status !== 'confirmed' && (
                      <Button
                        title={slot ? t('unblockSlot') : t('blockSlot')}
                        small
                        kind={slot ? 'secondary' : 'ghost'}
                        icon={slot ? 'lock-open' : 'lock-closed'}
                        loading={busyHour === hour}
                        onPress={() => toggle(hour, slot)}
                      />
                    )}
                  </Row>
                  {i < rows.length - 1 && <Divider />}
                </View>
              );
            })
          )}
        </Card>
        </>
        )}
      </ScrollView>
      <Sheet visible={!!actionSlot} onClose={() => setActionSlot(null)} title={t('bookingActions')}>
        {actionSlot && (
          <View style={{ gap: space.md }}>
            <Txt v="bodyStrong">{t('bookedBy', { name: actionSlot.playerName || t('player') })} · {formatHour(actionSlot.hour, lang)}</Txt>
            {actionSlot.startsAt && new Date(actionSlot.startsAt).getTime() < Date.now() ? (
              <Button
                title={actionSlot.noShow ? t('undoNoShow') : t('markNoShow')}
                kind="secondary"
                icon="person-remove-outline"
                onPress={async () => {
                  const sl = actionSlot;
                  setActionSlot(null);
                  try {
                    await api.ownerMarkNoShow(sl.id, !sl.noShow);
                    toast(t('done'), 'info');
                    load();
                  } catch (e) {
                    toast(errText(api.errorCode(e)), 'error');
                  }
                }}
              />
            ) : (
              <>
                <Field label={t('cancelReason')} placeholder={t('cancelReasonPh')} value={reason} onChangeText={setReason} />
                <Button
                  title={t('cancelBookingOwner')}
                  kind="danger"
                  icon="close-circle"
                  onPress={async () => {
                    const sl = actionSlot;
                    setActionSlot(null);
                    try {
                      await api.ownerCancelBooking(sl.id, reason.trim());
                      setReason('');
                      toast(t('bookingCancelledOwner'), 'info');
                      load();
                    } catch (e) {
                      toast(errText(api.errorCode(e)), 'error');
                    }
                  }}
                />
              </>
            )}
          </View>
        )}
      </Sheet>
    </View>
  );
}

function Reports({ pitchId }: { pitchId: string }) {
  const { t, lang, money, ownerReport, getPitch } = useApp();
  const [days, setDays] = useState<7 | 30>(7);
  const [rows, setRows] = useState<ReportDay[] | null>(null);
  const pitch = getPitch(pitchId);
  useEffect(() => {
    let alive = true;
    setRows(null);
    ownerReport(pitchId, days).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [pitchId, days, ownerReport]);

  const revenue = (rows ?? []).reduce((s, r) => s + r.revenue, 0);
  const bookings = (rows ?? []).reduce((s, r) => s + r.bookings, 0);
  const hours = (rows ?? []).reduce((s, r) => s + r.hours, 0);
  const open = (pitch.openTo - pitch.openFrom) * (rows?.length || 1);
  const best = (rows ?? []).reduce<ReportDay | null>((b, r) => (!b || r.revenue > b.revenue ? r : b), null);
  const max = Math.max(1, ...(rows ?? []).map((r) => r.revenue));

  return (
    <>
      <Row gap={8}>
        <Chip label={t('last7')} selected={days === 7} onPress={() => setDays(7)} />
        <Chip label={t('last30')} selected={days === 30} onPress={() => setDays(30)} />
      </Row>
      {!rows ? (
        <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} />
      ) : (
        <>
          <Card>
            <Row>
              <Stat icon="cash" value={money(revenue)} label={t('totalRevenue')} color={colors.success} />
              <Stat icon="calendar" value={bookings} label={t('totalBookings')} />
              <Stat icon="pie-chart" value={`${Math.round((hours / open) * 100)}%`} label={t('avgOccupancy')} color={colors.info} />
            </Row>
          </Card>
          <Card style={{ gap: space.md }}>
            <Txt v="h3">{t('revenuePerDay')}</Txt>
            <View style={{ flexDirection: lang === 'ar' ? 'row-reverse' : 'row', alignItems: 'flex-end', height: 140, gap: days === 7 ? 8 : 2 }}>
              {rows.map((r, i) => (
                <View key={r.dateISO} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View style={{ width: days === 7 ? '70%' : '100%', height: Math.max(3, (r.revenue / max) * 110), borderRadius: 4, backgroundColor: i === rows.length - 1 ? colors.primary : colors.accent }} />
                  {days === 7 && (
                    <Txt v="tiny" color={colors.textMuted}>
                      {fromISODate(r.dateISO).getDate()}
                    </Txt>
                  )}
                </View>
              ))}
            </View>
          </Card>
          {best && best.revenue > 0 && (
            <Card>
              <Row justify="space-between">
                <Row gap={8}>
                  <Ionicons name="trophy" size={18} color={colors.warning} />
                  <Txt v="bodyStrong">{t('bestDay')}</Txt>
                </Row>
                <Txt v="caption" color={colors.textMuted}>
                  {formatDay(fromISODate(best.dateISO), lang, { today: t('today'), tomorrow: t('tomorrow') })} · {money(best.revenue)}
                </Txt>
              </Row>
              <Txt v="tiny" color={colors.textMuted} style={{ marginTop: 6 }}>
                {t('hoursBooked')}: {hours}
              </Txt>
            </Card>
          )}
        </>
      )}
    </>
  );
}

const AMENITIES: { key: Amenity; icon: IconName }[] = [
  { key: 'parking', icon: 'car-outline' },
  { key: 'showers', icon: 'water-outline' },
  { key: 'lights', icon: 'bulb-outline' },
  { key: 'cafe', icon: 'cafe-outline' },
  { key: 'changing', icon: 'shirt-outline' },
  { key: 'balls', icon: 'football-outline' },
  { key: 'wifi', icon: 'wifi-outline' },
  { key: 'ac', icon: 'snow-outline' },
];

function Settings({ pitchId, price, setPrice, savePrice }: { pitchId: string; price: number; setPrice: (fn: (p: number) => number) => void; savePrice: () => Promise<void> }) {
  const { t, lang, money, getPitch, ownerUpdatePitch, errText } = useApp();
  const toast = useToast();
  const pitch = getPitch(pitchId);
  const [openFrom, setOpenFrom] = useState(pitch.openFrom);
  const [openTo, setOpenTo] = useState(pitch.openTo);
  const [amenities, setAmenities] = useState<Amenity[]>(pitch.amenities);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await ownerUpdatePitch(pitchId, { openFrom, openTo, amenities });
    if (r.ok && price !== pitch.pricePerHour) await savePrice();
    setSaving(false);
    toast(r.ok ? t('settingsSaved') : errText(r.error), r.ok ? 'success' : 'error');
  };

  return (
    <>
      <Card style={{ gap: space.md }}>
        <Txt v="h3">{t('pricePerHour')}</Txt>
        <Stepper value={price} onChange={(v) => setPrice(() => v)} min={1} max={500} step={0.5} format={money} />
      </Card>
      <Card style={{ gap: space.md }}>
        <Txt v="h3">{t('openingHours')}</Txt>
        <Row gap={space.md}>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt v="label" color={colors.textMuted}>{t('opensAt')}</Txt>
            <Stepper value={openFrom} onChange={(v) => setOpenFrom(Math.min(v, openTo - 1))} min={0} max={23} format={(v) => formatHour(v, lang)} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt v="label" color={colors.textMuted}>{t('closesAt')}</Txt>
            <Stepper value={openTo} onChange={(v) => setOpenTo(Math.max(v, openFrom + 1))} min={1} max={24} format={(v) => formatHour(v, lang)} />
          </View>
        </Row>
      </Card>
      <Card style={{ gap: space.md }}>
        <Txt v="h3">{t('amenities')}</Txt>
        <Row gap={8} wrap>
          {AMENITIES.map((a) => {
            const on = amenities.includes(a.key);
            return <Chip key={a.key} icon={a.icon} label={t(`amenity_${a.key}`)} selected={on} onPress={() => setAmenities(on ? amenities.filter((x) => x !== a.key) : [...amenities, a.key])} />;
          })}
        </Row>
      </Card>
      <Button title={t('save')} icon="checkmark-circle" loading={saving} onPress={save} />
    </>
  );
}
