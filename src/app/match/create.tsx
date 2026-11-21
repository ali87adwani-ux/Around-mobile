import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { Button, Chip, HScroll, IconButton, PitchArt, Row, Tap, Txt, haptic } from '@/components/ui';
import { ME_ID } from '@/data/seed';
import type { Level, Match } from '@/data/types';
import { dateFromOffset, formatDuration, formatHour, toISODate, weekdayShort } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, radius, shadow, space } from '@/theme';

const mult = { 5: 1, 7: 1.5, 11: 2.4 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <Txt v="h3">{title}</Txt>
      {children}
    </View>
  );
}

export default function CreateMatch() {
  const params = useLocalSearchParams<{ pitchId?: string; dayOffset?: string; hour?: string }>();
  const { t, l, lang, money, pitches, getPitch, bookedHours, dispatch, state } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [pitchId, setPitchId] = useState(params.pitchId ?? pitches[0].id);
  const [dayOff, setDayOff] = useState(params.dayOffset ? Number(params.dayOffset) : new Date().getHours() >= 22 ? 1 : 0);
  const [hour, setHour] = useState<number | null>(params.hour ? Number(params.hour) : null);
  const [duration, setDuration] = useState(1);
  const pitch = getPitch(pitchId);
  const [format, setFormat] = useState<5 | 7 | 11>(pitch.sizes[0]);
  const [level, setLevel] = useState<Level>(state.profile.level);
  // If the user arrives from a fresh booking, that slot is theirs: don't show it as taken.
  const fromBooking = !!params.hour;

  const iso = toISODate(dateFromOffset(dayOff));
  const booked = useMemo(() => bookedHours(pitchId, iso), [bookedHours, pitchId, iso]);
  const nowH = new Date().getHours() + 1;
  const slots = useMemo(() => {
    const r: { h: number; ok: boolean }[] = [];
    for (let h = pitch.openFrom; h < pitch.openTo; h++) {
      const mine = fromBooking && h === Number(params.hour) && pitchId === params.pitchId && dayOff === Number(params.dayOffset);
      let ok = mine || (h + duration <= pitch.openTo && !(dayOff === 0 && h < nowH));
      for (let x = h; !mine && ok && x < h + duration; x++) if (booked.has(Math.floor(x))) ok = false;
      r.push({ h, ok });
    }
    return r;
  }, [pitch, booked, duration, dayOff, nowH, fromBooking, params, pitchId]);

  const maxPlayers = format * 2;
  // Round each player's share up to the nearest quarter dinar.
  const perPlayer = Math.ceil(((pitch.pricePerHour * mult[format] * duration) / maxPlayers) * 4) / 4;

  const publish = () => {
    if (hour == null) return;
    const m: Match = {
      id: `c${Date.now()}`,
      pitchId,
      dayOffset: dayOff,
      hour,
      duration,
      format,
      level,
      pricePerPlayer: perPlayer,
      maxPlayers,
      playerIds: [ME_ID],
      organizerId: ME_ID,
      createdByMe: true,
    };
    dispatch({ type: 'createMatch', match: m });
    haptic.success();
    toast(t('gameCreated'));
    router.replace(`/match/${m.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row justify="space-between" style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <Txt v="h1">{t('createTitle')}</Txt>
        <IconButton icon="close" label="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.xl, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Section title={t('choosePitch')}>
          <View style={{ marginHorizontal: -space.lg }}>
            <HScroll gap={10}>
              {pitches.map((p) => {
                const sel = p.id === pitchId;
                return (
                  <Tap
                    key={p.id}
                    onPress={() => {
                      setPitchId(p.id);
                      setFormat(p.sizes[0]);
                      setHour(null);
                    }}
                    accessibilityState={{ selected: sel }}
                    style={{ width: 150, borderRadius: radius.lg, borderWidth: 2, borderColor: sel ? colors.primary : 'transparent', backgroundColor: colors.card, overflow: 'hidden' }}
                  >
                    <PitchArt tint={p.tint} height={64} radiusSize={0}>
                      {sel && (
                        <View style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={16} color={colors.primaryDark} />
                        </View>
                      )}
                    </PitchArt>
                    <View style={{ padding: 10 }}>
                      <Txt v="label" numberOfLines={1}>
                        {l(p.name)}
                      </Txt>
                      <Txt v="tiny" color={colors.textMuted} numberOfLines={1}>
                        {l(p.area)}
                      </Txt>
                    </View>
                  </Tap>
                );
              })}
            </HScroll>
          </View>
        </Section>

        <Section title={t('pickDate')}>
          <View style={{ marginHorizontal: -space.lg }}>
            <HScroll gap={8}>
              {Array.from({ length: 10 }).map((_, i) => {
                const dd = dateFromOffset(i);
                const sel = i === dayOff;
                return (
                  <Tap
                    key={i}
                    onPress={() => {
                      setDayOff(i);
                      setHour(null);
                    }}
                    style={{ width: 58, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: sel ? colors.primary : colors.card, borderWidth: 1, borderColor: sel ? colors.primary : colors.border }}
                  >
                    <Txt v="tiny" color={sel ? colors.accent : colors.textMuted} center>
                      {i === 0 ? t('today') : weekdayShort(dd, lang)}
                    </Txt>
                    <Txt v="h3" color={sel ? colors.white : colors.text} center>
                      {dd.getDate()}
                    </Txt>
                  </Tap>
                );
              })}
            </HScroll>
          </View>
        </Section>

        <Section title={t('pickTime')}>
          <Row gap={8} wrap>
            {slots.map(({ h, ok }) => {
              const sel = h === hour;
              return (
                <Tap
                  key={h}
                  disabled={!ok}
                  onPress={() => setHour(h)}
                  style={{ width: '23%', height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? colors.primary : ok ? colors.card : '#E9EDEB', borderWidth: 1, borderColor: sel ? colors.primary : ok ? colors.border : 'transparent' }}
                >
                  <Txt v="tiny" color={sel ? colors.white : ok ? colors.text : colors.textFaint} center>
                    {formatHour(h, lang)}
                  </Txt>
                </Tap>
              );
            })}
          </Row>
        </Section>

        <Section title={t('duration')}>
          <Row gap={8}>
            {[1, 1.5, 2].map((dur) => (
              <Chip key={dur} label={formatDuration(dur, lang)} selected={duration === dur} onPress={() => setDuration(dur)} />
            ))}
          </Row>
        </Section>

        <Section title={t('format')}>
          <Row gap={8}>
            {pitch.sizes.map((s) => (
              <Chip key={s} label={`${s}×${s}`} selected={format === s} onPress={() => setFormat(s)} />
            ))}
          </Row>
        </Section>

        <Section title={t('level')}>
          <Row gap={8} wrap>
            {(['beginner', 'intermediate', 'advanced'] as Level[]).map((lv) => (
              <Chip key={lv} label={t(`level_${lv}`)} selected={level === lv} onPress={() => setLevel(lv)} />
            ))}
          </Row>
        </Section>
      </ScrollView>

      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: space.lg, paddingBottom: insets.bottom + space.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, gap: space.md }, shadow]}>
        <Row justify="space-between">
          <View>
            <Txt v="tiny" color={colors.textMuted}>
              {t('priceSplit')}
            </Txt>
            <Txt v="caption" color={colors.textFaint}>
              {t('priceSplitHint', { pitch: money(pitch.pricePerHour * mult[format] * duration), n: maxPlayers })}
            </Txt>
          </View>
          <Txt v="h2" color={colors.primary}>
            {money(perPlayer)}
          </Txt>
        </Row>
        <Button title={t('publishGame')} icon="megaphone" disabled={hour == null} onPress={publish} />
      </View>
    </View>
  );
}
