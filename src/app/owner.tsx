import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, View } from 'react-native';
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
  const { t, l, lang, money, ownerPitches: ownPitches, staffPitches, ownerDay, ownerBlock, ownerUnblock, ownerUpdatePrice, errText, mode } = useApp();
  // Owners see their own pitches; staff see the pitches they help run (schedule only).
  const ownerPitches = useMemo(() => [...ownPitches, ...staffPitches.filter((sp) => !ownPitches.some((o) => o.id === sp.id))], [ownPitches, staffPitches]);
  const [tab, setTab] = useState<'schedule' | 'reports' | 'settings'>('schedule');
  const toast = useToast();
  const [pitchId, setPitchId] = useState(ownerPitches[0]?.id);
  const pitch = ownerPitches.find((p) => p.id === pitchId) ?? ownerPitches[0];
  const staffOnly = !!pitch && !ownPitches.some((o) => o.id === pitch.id);
  const courts = pitch?.courts ?? 1;
  const [dayOff, setDayOff] = useState(0);
  const iso = toISODate(dateFromOffset(dayOff));
  const [slots, setSlots] = useState<OwnerSlot[] | null>(null);
  const [price, setPrice] = useState(pitch?.pricePerHour ?? 0);
  const [busyHour, setBusyHour] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [actionSlot, setActionSlot] = useState<OwnerSlot | null>(null);
  const [reliability, setReliability] = useState<api.Reliability | null>(null);
  useEffect(() => {
    setReliability(null);
    if (!actionSlot || mode !== 'live') return;
    api.bookingReliability(actionSlot.id).then(setReliability).catch(() => {});
  }, [actionSlot, mode]);
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
    const out: { hour: number; items: OwnerSlot[]; covered: number; free: number }[] = [];
    for (let h = pitch.openFrom; h < pitch.openTo; h++) {
      const items = slots.filter((s) => Math.floor(s.hour) === h);
      const covered = slots.filter((s) => Math.floor(s.hour) !== h && h > s.hour && h < s.hour + s.duration).length;
      out.push({ hour: h, items, covered, free: Math.max(0, courts - items.length - covered) });
    }
    return out;
  }, [pitch, slots, courts]);

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
      <ScreenHeader
        title={staffOnly ? t('staffDashboard') : t('ownerDashboard')}
        right={staffOnly ? undefined : <Row gap={6}><IconButton icon="card-outline" label={t('billingTitle')} onPress={() => router.push('/billing')} /><IconButton icon="trophy-outline" label={t('myTournaments')} onPress={() => router.push('/tournament/mine')} /></Row>}
      />
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
        {courts > 1 && <Badge label={t('courtsN', { n: courts })} icon="grid-outline" />}
        {staffOnly ? (
          <Badge label={t('staffAccess')} icon="person-outline" color={colors.info} bg={colors.infoSoft} />
        ) : (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'schedule', label: t('tabSchedule') },
              { value: 'reports', label: t('tabReports') },
              { value: 'settings', label: t('tabSettings') },
            ]}
          />
        )}

        {tab === 'reports' && !staffOnly && <Reports pitchId={pitch.id} allIds={ownPitches.map((x) => x.id)} />}
        {tab === 'settings' && !staffOnly && (
          <>
            <Button title={t('editPitchDetails')} kind="secondary" icon="images-outline" onPress={() => router.push(`/listing/edit/pitch/${pitch.id}`)} />
            <Settings pitchId={pitch.id} price={price} setPrice={setPrice} savePrice={savePrice} />
            <CourtsAndStaff pitchId={pitch.id} courts={courts} />
            <PolicyEditor pitchId={pitch.id} />
          </>
        )}

        {(tab === 'schedule' || staffOnly) && (
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
            rows.map(({ hour, items, covered, free }, i) => {
              const past = hour < pastHour;
              const blocked = items.find((x) => x.status === 'blocked');
              return (
                <View key={hour}>
                  <Row gap={space.md} align="flex-start" style={{ paddingVertical: 12, opacity: past ? 0.45 : 1 }}>
                    <Txt v="label" color={colors.textMuted} style={{ width: 74, paddingTop: 4 }}>
                      {formatHour(hour, lang)}
                    </Txt>
                    <View style={{ flex: 1, gap: 6 }}>
                      {items.map((slot) =>
                        slot.status === 'confirmed' ? (
                          <Row key={slot.id} gap={6}>
                            <Ionicons name="person-circle" size={18} color={colors.primary} />
                            <View style={{ flex: 1 }}>
                              <Txt v="bodyStrong" numberOfLines={1}>
                                {slot.playerName ? t('bookedBy', { name: slot.playerName }) : t('appBooking')}
                              </Txt>
                              <Txt v="tiny" color={slot.noShow ? colors.danger : colors.textMuted}>
                                {courts > 1 ? `${t('courtN', { n: slot.court ?? 1 })} · ` : ''}
                                {!staffOnly && slot.total > 0 ? money(slot.total) : ''}
                                {slot.noShow ? ` · ${t('noShowMarked')}` : ''}
                              </Txt>
                            </View>
                            {mode === 'live' && <IconButton icon="ellipsis-horizontal" label={t('bookingActions')} size={34} onPress={() => setActionSlot(slot)} />}
                          </Row>
                        ) : (
                          <Row key={slot.id} gap={6}>
                            <Badge label={courts > 1 ? `${t('blocked')} · ${t('courtN', { n: slot.court ?? 1 })}` : t('blocked')} icon="lock-closed" color={colors.danger} bg={colors.dangerSoft} />
                            <View style={{ flex: 1 }} />
                            {!past && (
                              <Button title={t('unblockSlot')} small kind="secondary" icon="lock-open" loading={busyHour === hour} onPress={() => toggle(hour, slot)} />
                            )}
                          </Row>
                        ),
                      )}
                      {covered > 0 && items.length === 0 && (
                        <Row gap={6}>
                          <Ionicons name="person-circle" size={18} color={colors.primary} />
                          <Txt v="bodyStrong">{t('appBooking')}</Txt>
                        </Row>
                      )}
                      {free > 0 && (
                        <Row gap={6}>
                          <Badge label={courts > 1 ? t('freeCourts', { n: free, total: courts }) : t('free')} icon="ellipse-outline" color={colors.success} bg={colors.successSoft} />
                          <View style={{ flex: 1 }} />
                          {!past && (
                            <Button title={t('blockSlot')} small kind="ghost" icon="lock-closed" loading={busyHour === hour && !blocked} onPress={() => toggle(hour)} />
                          )}
                        </Row>
                      )}
                    </View>
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
            {reliability && (
              <Row gap={space.sm} style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: space.sm }}>
                <Stat icon="calendar-outline" value={reliability.bookings} label={t('bookingsCount')} />
                <Stat icon="person-remove-outline" value={reliability.no_shows} label={t('noShowsCount')} color={reliability.no_shows ? colors.danger : colors.textMuted} />
                <Stat icon="time-outline" value={reliability.late_cancels} label={t('lateCancelsCount')} color={reliability.late_cancels ? colors.warning : colors.textMuted} />
                <Stat icon="heart-outline" value={reliability.conduct.avg != null ? `${reliability.conduct.avg}★` : '—'} label={t('conduct')} color={colors.success} />
              </Row>
            )}
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

function Reports({ pitchId, allIds }: { pitchId: string; allIds: string[] }) {
  const { t, l, lang, money, ownerReport, getPitch } = useApp();
  const [days, setDays] = useState<7 | 30>(7);
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [rows, setRows] = useState<ReportDay[] | null>(null);
  const [perPitch, setPerPitch] = useState<{ id: string; revenue: number; bookings: number; occupancy: number }[]>([]);
  const ids = scope === 'all' ? allIds : [pitchId];
  const pitch = getPitch(pitchId);
  useEffect(() => {
    let alive = true;
    setRows(null);
    Promise.all(ids.map((id) => ownerReport(id, days).then((r) => ({ id, r }))))
      .then((list) => {
        if (!alive) return;
        // Sum every pitch day by day (one pitch = its own numbers).
        const byDay = new Map<string, ReportDay>();
        for (const { r } of list)
          for (const d of r) {
            const cur = byDay.get(d.dateISO) ?? { dateISO: d.dateISO, bookings: 0, hours: 0, revenue: 0 };
            byDay.set(d.dateISO, { dateISO: d.dateISO, bookings: cur.bookings + d.bookings, hours: cur.hours + d.hours, revenue: cur.revenue + d.revenue });
          }
        setRows([...byDay.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO)));
        setPerPitch(
          list
            .map(({ id, r }) => {
              const p = getPitch(id);
              const hrs = r.reduce((s, d) => s + d.hours, 0);
              const cap = (p.openTo - p.openFrom) * (p.courts ?? 1) * (r.length || 1);
              return { id, revenue: r.reduce((s, d) => s + d.revenue, 0), bookings: r.reduce((s, d) => s + d.bookings, 0), occupancy: cap ? Math.round((hrs / cap) * 100) : 0 };
            })
            .sort((a, b) => b.revenue - a.revenue),
        );
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [pitchId, days, scope, ownerReport, allIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const revenue = (rows ?? []).reduce((s, r) => s + r.revenue, 0);
  const bookings = (rows ?? []).reduce((s, r) => s + r.bookings, 0);
  const hours = (rows ?? []).reduce((s, r) => s + r.hours, 0);
  const open = ids.reduce((s, id) => { const p = getPitch(id); return s + (p.openTo - p.openFrom) * (p.courts ?? 1); }, 0) * (rows?.length || 1);
  const best = (rows ?? []).reduce<ReportDay | null>((b, r) => (!b || r.revenue > b.revenue ? r : b), null);
  const max = Math.max(1, ...(rows ?? []).map((r) => r.revenue));

  return (
    <>
      {allIds.length > 1 && (
        <Segmented<'one' | 'all'> value={scope} onChange={setScope} options={[{ value: 'one', label: l(pitch.name) }, { value: 'all', label: t('allPitches') }]} />
      )}
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
          {scope === 'all' && perPitch.length > 1 && (
            <Card style={{ gap: space.sm }}>
              <Txt v="h3">{t('comparePitches')}</Txt>
              {perPitch.map((x, i) => (
                <Row key={x.id} gap={space.sm}>
                  <Txt v="label" style={{ width: 20 }}>{i + 1}</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong" numberOfLines={1}>{l(getPitch(x.id).name)}</Txt>
                    <Txt v="tiny" color={colors.textMuted}>{t('totalBookings')}: {x.bookings} · {t('avgOccupancy')}: {x.occupancy}%</Txt>
                  </View>
                  <Txt v="label" color={colors.success}>{money(x.revenue)}</Txt>
                </Row>
              ))}
            </Card>
          )}
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

/** Number of courts at the venue, and the staff who can run the schedule. */
function CourtsAndStaff({ pitchId, courts }: { pitchId: string; courts: number }) {
  const { t, l, getPitch, errText, mode, refresh } = useApp();
  const toast = useToast();
  const [n, setN] = useState(courts);
  const [staff, setStaff] = useState<{ userId: string; name: string; avatarUrl?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setN(courts), [courts]);
  const loadStaff = useCallback(() => {
    if (mode === 'live') api.staffList(pitchId).then(setStaff).catch(() => setStaff([]));
  }, [mode, pitchId]);
  useEffect(loadStaff, [loadStaff]);

  const invite = async () => {
    if (mode !== 'live') return toast(errText('live_only'), 'error');
    try {
      const code = await api.createStaffInvite(pitchId);
      await Share.share({ message: t('staffInviteMessage', { pitch: l(getPitch(pitchId).name), code }) });
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
  };

  return (
    <>
      <Card style={{ gap: space.sm }}>
        <Txt v="h3">{t('courtsAtVenue')}</Txt>
        <Txt v="caption" color={colors.textMuted}>{t('courtsHint')}</Txt>
        <Stepper value={n} onChange={setN} min={1} max={20} format={(v) => t('courtsN', { n: v })} />
        {n !== courts && (
          <Button
            title={t('save')}
            small
            loading={busy}
            onPress={async () => {
              if (mode !== 'live') return toast(errText('live_only'), 'error');
              setBusy(true);
              try {
                await api.setPitchCourts(pitchId, n);
                await refresh();
                toast(t('saved'), 'success');
              } catch (e) {
                toast(errText(api.errorCode(e)), 'error');
              }
              setBusy(false);
            }}
          />
        )}
      </Card>
      <Card style={{ gap: space.sm }}>
        <Row justify="space-between">
          <Txt v="h3">{t('staff')}</Txt>
          <Button title={t('addStaff')} small icon="person-add-outline" onPress={invite} />
        </Row>
        <Txt v="caption" color={colors.textMuted}>{t('staffHint')}</Txt>
        {staff.length === 0 ? (
          <Txt v="caption" color={colors.textFaint}>{t('noStaff')}</Txt>
        ) : (
          staff.map((m) => (
            <Row key={m.userId} gap={space.sm}>
              <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
              <Txt v="bodyStrong" style={{ flex: 1 }}>{m.name || t('player')}</Txt>
              <Button
                title={t('remove')}
                small
                kind="ghost"
                onPress={async () => {
                  try {
                    await api.removeStaff(pitchId, m.userId);
                    loadStaff();
                  } catch (e) {
                    toast(errText(api.errorCode(e)), 'error');
                  }
                }}
              />
            </Row>
          ))
        )}
      </Card>
    </>
  );
}

const CANCEL_OPTIONS = [0, 2, 3, 6, 12, 24, 48];
const REFUND_OPTIONS = [0, 25, 50, 100];

/** Owner sets the free-cancellation window and what is refunded after it (or on a no-show). */
function PolicyEditor({ pitchId }: { pitchId: string }) {
  const { t, getPitch, errText, mode, refresh } = useApp();
  const toast = useToast();
  const p = getPitch(pitchId);
  const [hours, setHours] = useState(p.cancelHours ?? 6);
  const [pct, setPct] = useState(p.lateRefundPct ?? 0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setHours(p.cancelHours ?? 6);
    setPct(p.lateRefundPct ?? 0);
  }, [p.cancelHours, p.lateRefundPct]);
  const changed = hours !== (p.cancelHours ?? 6) || pct !== (p.lateRefundPct ?? 0);
  return (
    <Card style={{ gap: space.sm }}>
      <Txt v="h3">{t('policyTitle')}</Txt>
      <Txt v="caption" color={colors.textMuted}>{t('policyOwnerHint')}</Txt>
      <Txt v="label" color={colors.textMuted}>{t('freeCancelUntil')}</Txt>
      <Row gap={8} wrap>
        {CANCEL_OPTIONS.map((h) => (
          <Chip key={h} label={h === 0 ? t('anytime') : t('hoursBefore', { n: h })} selected={hours === h} onPress={() => setHours(h)} />
        ))}
      </Row>
      {hours > 0 && (
        <>
          <Txt v="label" color={colors.textMuted}>{t('lateRefundLabel')}</Txt>
          <Row gap={8} wrap>
            {REFUND_OPTIONS.map((v) => (
              <Chip key={v} label={v === 0 ? t('noRefund') : `${v}%`} selected={pct === v} onPress={() => setPct(v)} />
            ))}
          </Row>
        </>
      )}
      {changed && (
        <Button
          title={t('save')}
          loading={busy}
          onPress={async () => {
            if (mode !== 'live') return toast(errText('live_only'), 'error');
            setBusy(true);
            try {
              await api.setPitchPolicy(pitchId, hours, pct);
              await refresh();
              toast(t('saved'), 'success');
            } catch (e) {
              toast(errText(api.errorCode(e)), 'error');
            }
            setBusy(false);
          }}
        />
      )}
    </Card>
  );
}
