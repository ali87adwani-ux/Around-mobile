import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, Card, Chip, Divider, EmptyState, HScroll, IconButton, Row, Stat, Tap, Txt, haptic } from '@/components/ui';
import { dateFromOffset, formatHour, toISODate, weekdayShort } from '@/i18n/format';
import { useApp, type OwnerSlot } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

export default function OwnerDashboard() {
  const { t, l, lang, money, ownerPitches, ownerDay, ownerBlock, ownerUnblock, ownerUpdatePrice, errText, mode } = useApp();
  const toast = useToast();
  const [pitchId, setPitchId] = useState(ownerPitches[0]?.id);
  const pitch = ownerPitches.find((p) => p.id === pitchId) ?? ownerPitches[0];
  const [dayOff, setDayOff] = useState(0);
  const iso = toISODate(dateFromOffset(dayOff));
  const [slots, setSlots] = useState<OwnerSlot[] | null>(null);
  const [price, setPrice] = useState(pitch?.pricePerHour ?? 0);
  const [busyHour, setBusyHour] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

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
        <EmptyState icon="business-outline" title={t('ownerNoPitches')} body={t('ownerNoPitchesSub')} />
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
      <ScreenHeader title={t('ownerDashboard')} right={<IconButton icon="refresh" label="refresh" onPress={load} />} />
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

        {/* Price */}
        <Card style={{ gap: space.md }}>
          <Txt v="h3">{t('pricePerHour')}</Txt>
          <Row gap={space.md}>
            <IconButton icon="remove" label="decrease" bg={colors.surfaceMuted} onPress={() => setPrice((p) => Math.max(1, Math.round((p - 0.5) * 2) / 2))} />
            <Txt v="h1" center style={{ flex: 1 }} color={colors.primary}>
              {money(price)}
            </Txt>
            <IconButton icon="add" label="increase" bg={colors.surfaceMuted} onPress={() => setPrice((p) => Math.round((p + 0.5) * 2) / 2)} />
          </Row>
          <Button title={t('save')} small kind="secondary" disabled={price === pitch.pricePerHour} onPress={savePrice} />
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
                            <Txt v="tiny" color={colors.textMuted}>
                              {money(slot.total)}
                            </Txt>
                          )}
                        </>
                      ) : slot?.status === 'blocked' ? (
                        <Badge label={t('blocked')} icon="lock-closed" color={colors.danger} bg={colors.dangerSoft} />
                      ) : (
                        <Badge label={t('free')} icon="ellipse-outline" color={colors.success} bg={colors.successSoft} />
                      )}
                    </View>
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
      </ScrollView>
    </View>
  );
}
