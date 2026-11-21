import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FavButton } from '@/components/cards';
import { Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, Card, Chip, Divider, Field, HScroll, PitchArt, Row, Tap, Txt, haptic, type IconName } from '@/components/ui';
import { prayerInHour } from '@/lib/prayer';
import { bookingPrice, isOffPeak } from '@/lib/pricing';
import type { Amenity, PitchSize } from '@/data/types';
import { dateFromOffset, formatDay, formatDuration, formatHour, toISODate, weekdayShort } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, radius, shadow, space } from '@/theme';

const amenityIcon: Record<Amenity, IconName> = {
  parking: 'car-outline',
  showers: 'water-outline',
  lights: 'bulb-outline',
  cafe: 'cafe-outline',
  changing: 'shirt-outline',
  balls: 'football-outline',
  wifi: 'wifi-outline',
  ac: 'snow-outline',
};

const sizeMultiplier: Record<PitchSize, number> = { 5: 1, 6: 1.2, 7: 1.5, 11: 2.4 };

export default function PitchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, money, getPitch, bookedHours, loadBusy, bookPitch, errText, getReviews, loadReviews, canReview, addReview } = useApp();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const pitch = getPitch(id);

  const [dayOff, setDayOff] = useState(new Date().getHours() >= 22 ? 1 : 0);
  const [size, setSize] = useState<PitchSize>(pitch.sizes[0]);
  const [duration, setDuration] = useState(1);
  const [hour, setHour] = useState<number | null>(null);
  const [summary, setSummary] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const date = dateFromOffset(dayOff);
  const iso = toISODate(date);
  useEffect(() => {
    loadBusy(pitch.id, iso);
  }, [loadBusy, pitch.id, iso]);
  useEffect(() => {
    loadReviews(pitch.id);
  }, [loadReviews, pitch.id]);
  const reviews = getReviews(pitch.id);
  const booked = useMemo(() => bookedHours(pitch.id, iso), [bookedHours, pitch.id, iso]);
  const nowH = new Date().getHours() + 1;
  const labels = { today: t('today'), tomorrow: t('tomorrow') };

  const slots = useMemo(() => {
    const out: { h: number; available: boolean }[] = [];
    for (let h = pitch.openFrom; h < pitch.openTo; h++) {
      let ok = h + duration <= pitch.openTo && !(dayOff === 0 && h < nowH);
      for (let x = h; ok && x < h + duration; x++) if (booked.has(Math.floor(x))) ok = false;
      out.push({ h, available: ok });
    }
    return out;
  }, [pitch, duration, booked, dayOff, nowH]);

  const { price, full, discounted } = bookingPrice(pitch, size, duration, iso, hour ?? undefined);
  const anyOffPeak = slots.some(({ h }) => isOffPeak(iso, h));

  const confirm = async () => {
    if (hour == null) return;
    setLoading(true);
    const r = await bookPitch({ pitchId: pitch.id, dateISO: iso, hour, duration, size, total: price });
    setLoading(false);
    setSummary(false);
    if (!r.ok) {
      haptic.warn();
      toast(errText(r.error), 'error');
      setHour(null);
      loadBusy(pitch.id, iso);
      return;
    }
    haptic.success();
    setTimeout(() => setSuccess(true), 250);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <ScreenHeader transparent light right={<FavButton id={pitch.id} size={42} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <PitchArt tint={pitch.tint} height={260 + insets.top} radiusSize={0}>
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, paddingBottom: space.xxl }}>
            <Row gap={6}>
              <Badge label={pitch.indoor ? t('indoor') : t('outdoor')} color={colors.white} bg="rgba(0,0,0,0.3)" icon={pitch.indoor ? 'home' : 'sunny'} />
              <Badge label={pitch.surface === 'artificial' ? t('artificial') : t('natural')} color={colors.white} bg="rgba(0,0,0,0.3)" icon="leaf" />
            </Row>
          </View>
        </PitchArt>

        <View style={{ marginTop: -space.xl, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.xl }}>
          {/* Title */}
          <View style={{ gap: 6 }}>
            <Txt v="h1">{l(pitch.name)}</Txt>
            <Row gap={6}>
              <Ionicons name="location" size={15} color={colors.primary} />
              <Txt v="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {l(pitch.area)} — {l(pitch.address)}
              </Txt>
            </Row>
            <Row gap={space.lg} style={{ marginTop: 4 }}>
              <Row gap={4}>
                <Ionicons name="star" size={16} color={colors.warning} />
                <Txt v="label">{pitch.rating.toFixed(1)}</Txt>
                <Txt v="caption" color={colors.textMuted}>
                  ({t('reviews', { n: pitch.reviews })})
                </Txt>
              </Row>
              <Row gap={4}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Txt v="caption" color={colors.textMuted}>
                  {t('openHours', { from: formatHour(pitch.openFrom, lang), to: formatHour(pitch.openTo, lang) })}
                </Txt>
              </Row>
            </Row>
          </View>

          {pitch.lat != null && pitch.lng != null && (
            <Row gap={space.sm}>
              <Button title={t('googleMaps')} small kind="ghost" icon="navigate-outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${pitch.lat},${pitch.lng}`).catch(() => {})} />
              <Button title={t('waze')} small kind="ghost" icon="car-outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://waze.com/ul?ll=${pitch.lat},${pitch.lng}&navigate=yes`).catch(() => {})} />
            </Row>
          )}

          {/* Amenities */}
          <View style={{ gap: space.md }}>
            <Txt v="h3">{t('amenities')}</Txt>
            <Row gap={8} wrap>
              {pitch.amenities.map((a) => (
                <Row key={a} gap={6} style={{ backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name={amenityIcon[a]} size={16} color={colors.primary} />
                  <Txt v="caption">{t(`amenity_${a}`)}</Txt>
                </Row>
              ))}
            </Row>
          </View>

          <Divider />

          {/* Size */}
          {pitch.sizes.length > 1 && (
            <View style={{ gap: space.md }}>
              <Txt v="h3">{t('pitchSize')}</Txt>
              <Row gap={8}>
                {pitch.sizes.map((s) => (
                  <Chip key={s} label={`${s}×${s} · ${money(pitch.pricePerHour * sizeMultiplier[s])}`} selected={size === s} onPress={() => setSize(s)} />
                ))}
              </Row>
            </View>
          )}

          {/* Date */}
          <View style={{ gap: space.md }}>
            <Txt v="h3">{t('pickDate')}</Txt>
            <View style={{ marginHorizontal: -space.lg }}>
              <HScroll gap={8}>
                {Array.from({ length: 14 }).map((_, i) => {
                  const dd = dateFromOffset(i);
                  const sel = i === dayOff;
                  return (
                    <Tap
                      key={i}
                      haptics={false}
                      onPress={() => {
                        haptic.select();
                        setDayOff(i);
                        setHour(null);
                      }}
                      accessibilityState={{ selected: sel }}
                      style={{ width: 62, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', backgroundColor: sel ? colors.primary : colors.card, borderWidth: 1, borderColor: sel ? colors.primary : colors.border }}
                    >
                      <Txt v="tiny" color={sel ? colors.accent : colors.textMuted} center>
                        {i === 0 ? t('today') : weekdayShort(dd, lang)}
                      </Txt>
                      <Txt v="h2" color={sel ? colors.white : colors.text} center>
                        {dd.getDate()}
                      </Txt>
                    </Tap>
                  );
                })}
              </HScroll>
            </View>
          </View>

          {/* Duration */}
          <View style={{ gap: space.md }}>
            <Txt v="h3">{t('duration')}</Txt>
            <Row gap={8}>
              {[1, 1.5, 2].map((dur) => (
                <Chip
                  key={dur}
                  label={formatDuration(dur, lang)}
                  selected={duration === dur}
                  onPress={() => {
                    setDuration(dur);
                    setHour(null);
                  }}
                />
              ))}
            </Row>
          </View>

          {/* Time */}
          <View style={{ gap: space.md }}>
            <Row justify="space-between">
              <Txt v="h3">{t('pickTime')}</Txt>
              <Row gap={10}>
                <Row gap={4}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }} />
                  <Txt v="tiny" color={colors.textMuted}>
                    {t('selectSlot')}
                  </Txt>
                </Row>
                <Row gap={4}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.surfaceMuted }} />
                  <Txt v="tiny" color={colors.textMuted}>
                    {t('booked')}
                  </Txt>
                </Row>
              </Row>
            </Row>
            <Row gap={8} wrap>
              {slots.map(({ h, available }) => {
                const sel = hour === h;
                const inRange = hour != null && h > hour && h < hour + duration;
                return (
                  <Tap
                    key={h}
                    haptics={false}
                    disabled={!available}
                    onPress={() => {
                      haptic.select();
                      setHour(h);
                    }}
                    accessibilityState={{ selected: sel, disabled: !available }}
                    style={{
                      width: '31.5%',
                      height: 54,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: sel ? colors.primary : inRange ? colors.primarySoft : available ? colors.card : colors.surfaceMuted,
                      borderWidth: 1,
                      borderColor: sel ? colors.primary : inRange ? colors.primary : available ? colors.border : 'transparent',
                    }}
                  >
                    <Txt v="label" color={sel ? colors.white : available ? colors.text : colors.textFaint} center style={!available ? { textDecorationLine: 'line-through' } : undefined}>
                      {formatHour(h, lang)}
                    </Txt>
                    {(() => {
                      const pr = prayerInHour(iso, h);
                      const off = available && isOffPeak(iso, h);
                      if (!pr && !off) return null;
                      return (
                        <Row gap={4} justify="center">
                          {off && (
                            <Txt v="tiny" color={sel ? colors.accent : colors.success} style={{ fontSize: 10, lineHeight: 14 }}>
                              {t('offPeak')}
                            </Txt>
                          )}
                          {pr && (
                            <Row gap={2}>
                              <Ionicons name="moon" size={9} color={sel ? colors.accent : colors.warning} />
                              <Txt v="tiny" color={sel ? colors.white : colors.textMuted} style={{ fontSize: 10, lineHeight: 14 }}>
                                {t(`prayer_${pr.name}`)} {formatHour(pr.at, lang).split(' ')[0]}
                              </Txt>
                            </Row>
                          )}
                        </Row>
                      );
                    })()}
                  </Tap>
                );
              })}
            </Row>
            {anyOffPeak && (
              <Row gap={6} align="flex-start" style={{ backgroundColor: colors.successSoft, borderRadius: radius.md, padding: space.sm }}>
                <Ionicons name="pricetag" size={14} color={colors.success} />
                <Txt v="tiny" color={colors.success} style={{ flex: 1 }}>
                  {t('offPeakHint')}
                </Txt>
              </Row>
            )}
          </View>

          {/* Reviews */}
          <View style={{ gap: space.md }}>
            <Row justify="space-between">
              <Row gap={6}>
                <Txt v="h3">{t('reviewsTitle')}</Txt>
                <Ionicons name="star" size={15} color={colors.warning} />
                <Txt v="label">{pitch.rating.toFixed(1)}</Txt>
                <Txt v="caption" color={colors.textMuted}>
                  ({pitch.reviews})
                </Txt>
              </Row>
              {canReview(pitch.id) && <Button title={t('ratePitch')} small kind="secondary" icon="star-outline" onPress={() => setReviewOpen(true)} />}
            </Row>
            {reviews.length === 0 ? (
              <Txt v="caption" color={colors.textMuted}>
                {t('noReviews')}
              </Txt>
            ) : (
              reviews.slice(0, 5).map((r) => (
                <Card key={r.id} flat style={{ borderWidth: 1, borderColor: colors.border, gap: 4 }}>
                  <Row justify="space-between">
                    <Txt v="bodyStrong">{r.userName || '—'}</Txt>
                    <Row gap={1}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={13} color={colors.warning} />
                      ))}
                    </Row>
                  </Row>
                  {!!r.comment && (
                    <Txt v="caption" color={colors.textMuted}>
                      {r.comment}
                    </Txt>
                  )}
                </Card>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky bar */}
      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: space.lg, paddingBottom: insets.bottom + space.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }, shadow]}>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Txt v="tiny" color={colors.textMuted}>
              {hour != null ? `${formatDay(date, lang, labels)} · ${formatHour(hour, lang)}` : t('selectSlot')}
            </Txt>
            <Row gap={6} align="flex-end">
              <Txt v="h2" color={colors.primary}>
                {money(price)}
              </Txt>
              {discounted && (
                <Txt v="caption" color={colors.textFaint} style={{ textDecorationLine: 'line-through', marginBottom: 4 }}>
                  {money(full)}
                </Txt>
              )}
            </Row>
          </View>
          <Button title={t('continue')} disabled={hour == null} onPress={() => setSummary(true)} style={{ flex: 1.3 }} icon="calendar" />
        </Row>
      </View>

      {/* Summary */}
      <Sheet visible={summary} onClose={() => setSummary(false)} title={t('bookingSummary')}>
        <View style={{ gap: space.md, marginBottom: space.xl }}>
          {[
            ['football-outline', l(pitch.name)],
            ['calendar-outline', formatDay(date, lang, labels)],
            ['time-outline', hour != null ? `${formatHour(hour, lang)} – ${formatHour(hour + duration, lang)} (${formatDuration(duration, lang)})` : ''],
            ['resize-outline', `${size}×${size}`],
          ].map(([icon, text]) => (
            <Row key={icon} gap={space.md}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon as IconName} size={18} color={colors.primary} />
              </View>
              <Txt v="bodyStrong" style={{ flex: 1 }}>
                {text}
              </Txt>
            </Row>
          ))}
          <Divider style={{ marginVertical: space.xs }} />
          <Row justify="space-between">
            <Txt v="h3">{t('total')}</Txt>
            <Txt v="h2" color={colors.primary}>
              {money(price)}
            </Txt>
          </Row>
          <Row gap={8} align="flex-start" style={{ backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: space.md }}>
            <Ionicons name="information-circle" size={18} color={colors.info} />
            <Txt v="caption" color={colors.info} style={{ flex: 1 }}>
              {t('payAtPitch')}
            </Txt>
          </Row>
        </View>
        <Button title={t('bookNow', { price: money(price) })} onPress={confirm} loading={loading} icon="checkmark-circle" />
      </Sheet>

      {/* Review */}
      <Sheet visible={reviewOpen} onClose={() => setReviewOpen(false)} title={t('ratePitch')}>
        <View style={{ gap: space.lg }}>
          <Row gap={10} justify="center">
            {[1, 2, 3, 4, 5].map((n) => (
              <Tap key={n} onPress={() => setStars(n)} accessibilityLabel={`${n}`}>
                <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={38} color={colors.warning} />
              </Tap>
            ))}
          </Row>
          <Field label={t('yourRating')} placeholder={t('commentPlaceholder')} value={comment} onChangeText={setComment} maxLength={500} />
          <Button
            title={t('save')}
            icon="checkmark-circle"
            onPress={async () => {
              const r = await addReview(pitch.id, stars, comment.trim());
              if (!r.ok) return toast(errText(r.error), 'error');
              setReviewOpen(false);
              setComment('');
              toast(t('reviewSaved'));
            }}
          />
        </View>
      </Sheet>

      {/* Success */}
      <Sheet visible={success} onClose={() => setSuccess(false)}>
        <View style={{ alignItems: 'center', gap: space.sm, marginBottom: space.xl }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm }}>
            <Ionicons name="checkmark" size={46} color={colors.primaryDark} />
          </View>
          <Txt v="h1" center>
            {t('bookingConfirmed')}
          </Txt>
          <Txt v="body" color={colors.textMuted} center>
            {t('bookingConfirmedSub')}
          </Txt>
        </View>
        <View style={{ gap: space.sm }}>
          <Button
            title={t('viewBookings')}
            onPress={() => {
              setSuccess(false);
              router.push('/bookings');
            }}
          />
          <Button
            title={t('findPlayers')}
            kind="secondary"
            icon="people"
            onPress={() => {
              setSuccess(false);
              router.push({ pathname: '/match/create', params: { pitchId: pitch.id, dayOffset: String(dayOff), hour: String(hour ?? '') } });
            }}
          />
          <Button
            title={t('done')}
            kind="ghost"
            onPress={() => {
              setSuccess(false);
              setHour(null);
              toast(t('bookingConfirmed'));
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}
