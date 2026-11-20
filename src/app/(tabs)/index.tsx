import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MatchCard, PitchCard, statusBadge } from '@/components/cards';
import { Avatar, Card, HScroll, EmptyState, IconButton, PitchArt, Row, SectionHeader, Tap, Txt, useDir, type IconName } from '@/components/ui';
import { dateFromOffset, formatDay, formatHour, fromISODate, offsetOf } from '@/i18n/format';
import type { StringKey } from '@/i18n/strings';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

type Upcoming = { key: string; kind: 'booking' | 'match'; when: number; title: string; sub: string; onPress: () => void };

export default function Home() {
  const app = useApp();
  const { t, l, lang, state, me, allMatches, pitches, tournaments, getPitch, isJoined } = app;
  const insets = useSafeAreaInsets();
  const d = useDir();
  const labels = { today: t('today'), tomorrow: t('tomorrow') };

  const upcoming: Upcoming[] = useMemo(() => {
    const items: Upcoming[] = [];
    for (const b of state.bookings) {
      if (b.status !== 'confirmed') continue;
      const off = offsetOf(fromISODate(b.dateISO));
      if (off < 0) continue;
      const p = getPitch(b.pitchId);
      items.push({
        key: b.id,
        kind: 'booking',
        when: off * 24 + b.hour,
        title: l(p.name),
        sub: `${formatDay(fromISODate(b.dateISO), lang, labels)} · ${formatHour(b.hour, lang)}`,
        onPress: () => router.push('/bookings'),
      });
    }
    for (const m of allMatches) {
      if (!isJoined(m.id) || m.dayOffset < 0) continue;
      const p = getPitch(m.pitchId);
      items.push({
        key: m.id,
        kind: 'match',
        when: m.dayOffset * 24 + m.hour,
        title: l(p.name),
        sub: `${formatDay(dateFromOffset(m.dayOffset), lang, labels)} · ${formatHour(m.hour, lang)}`,
        onPress: () => router.push(`/match/${m.id}`),
      });
    }
    return items.sort((a, b) => a.when - b.when);
  }, [state.bookings, allMatches, state.joinedMatchIds, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearby = allMatches.filter((m) => m.dayOffset >= 0 && !isJoined(m.id)).slice(0, 5);
  const topPitches = [...pitches].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const live = tournaments.find((x) => x.status === 'live');

  const quick: { icon: IconName; label: StringKey; onPress: () => void; bg: string; fg: string }[] = [
    { icon: 'calendar', label: 'quickBook', onPress: () => router.push('/pitches'), bg: colors.primary, fg: colors.white },
    { icon: 'people', label: 'quickJoin', onPress: () => router.push('/matches'), bg: colors.accent, fg: colors.primaryDark },
    { icon: 'add-circle', label: 'quickCreate', onPress: () => router.push('/match/create'), bg: colors.infoSoft, fg: colors.info },
    { icon: 'trophy', label: 'quickCups', onPress: () => router.push('/tournaments'), bg: colors.warningSoft, fg: colors.warning },
  ];

  const firstName = state.profile.name.split(' ')[0] || l(me.name);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.lg }}>
        <Row justify="space-between">
          <Row gap={space.md} style={{ flex: 1 }}>
            <Tap onPress={() => router.push('/profile')}>
              <Avatar name={state.profile.name || 'Me'} size={46} />
            </Tap>
            <View style={{ flex: 1 }}>
              <Txt v="h2" numberOfLines={1}>
                {t('greeting', { name: firstName })}
              </Txt>
              <Txt v="caption" color={colors.textMuted}>
                {t('greetingSub')}
              </Txt>
            </View>
          </Row>
          <IconButton icon="search" label="search" onPress={() => router.push('/pitches')} />
        </Row>
      </View>

      {/* Quick actions */}
      <Row gap={space.sm} style={{ paddingHorizontal: space.lg }}>
        {quick.map((q) => (
          <Tap key={q.label} onPress={q.onPress} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: '100%', aspectRatio: 1, maxHeight: 76, borderRadius: radius.lg, backgroundColor: q.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={q.icon} size={26} color={q.fg} />
            </View>
            <Txt v="tiny" center numberOfLines={1}>
              {t(q.label)}
            </Txt>
          </Tap>
        ))}
      </Row>

      {/* Up next */}
      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <SectionHeader title={t('upNext')} />
        {upcoming.length === 0 ? (
          <Card flat style={{ borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: 'transparent' }}>
            <EmptyState icon="calendar-outline" title={t('noUpcoming')} body={t('noUpcomingSub')} action={t('bookBrowse')} onAction={() => router.push('/pitches')} />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {upcoming.slice(0, 3).map((u, i) => (
              <Card key={u.key} onPress={u.onPress} style={i === 0 ? { backgroundColor: colors.primary } : undefined}>
                <Row gap={space.md}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: i === 0 ? 'rgba(255,255,255,0.15)' : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={u.kind === 'booking' ? 'calendar' : 'football'} size={22} color={i === 0 ? colors.accent : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="h3" color={i === 0 ? colors.white : colors.text} numberOfLines={1}>
                      {u.title}
                    </Txt>
                    <Txt v="caption" color={i === 0 ? 'rgba(255,255,255,0.8)' : colors.textMuted}>
                      {u.sub}
                    </Txt>
                  </View>
                  <Ionicons name={d.forward} size={20} color={i === 0 ? colors.white : colors.textFaint} />
                </Row>
              </Card>
            ))}
          </View>
        )}
      </View>

      {/* Games near you */}
      <View style={{ marginTop: space.xl }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionHeader title={t('gamesNearYou')} action={t('seeAll')} onAction={() => router.push('/matches')} />
        </View>
        <HScroll>
          {nearby.map((m) => (
            <MatchCard key={m.id} match={m} compact />
          ))}
        </HScroll>
      </View>

      {/* Live tournament */}
      {live && (
        <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
          <SectionHeader title={t('liveCup')} />
          <Tap onPress={() => router.push(`/tournament/${live.id}`)} scale={0.985}>
            <PitchArt tint={live.tint} height={120}>
              <Row style={{ flex: 1, padding: space.lg }} gap={space.md}>
                <View style={{ flex: 1, gap: 6 }}>
                  {statusBadge(live.status, t)}
                  <Txt v="h2" color={colors.white}>
                    {l(live.name)}
                  </Txt>
                  <Txt v="caption" color="rgba(255,255,255,0.8)">
                    {t('standings')} · {t('fixtures')}
                  </Txt>
                </View>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(200,241,105,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trophy" size={32} color={colors.accent} />
                </View>
              </Row>
            </PitchArt>
          </Tap>
        </View>
      )}

      {/* Top pitches */}
      <View style={{ marginTop: space.xl }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionHeader title={t('topPitches')} action={t('seeAll')} onAction={() => router.push('/pitches')} />
        </View>
        <HScroll>
          {topPitches.map((p) => (
            <PitchCard key={p.id} pitch={p} compact />
          ))}
        </HScroll>
      </View>
    </ScrollView>
  );
}
