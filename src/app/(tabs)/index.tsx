import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AcademyCard } from '@/components/academy';
import { MatchCard, PitchCard, statusBadge } from '@/components/cards';
import { useAcademies } from '@/store/academies';
import { useAdmin } from '@/store/admin';
import { Avatar, Card, HScroll, EmptyState, IconButton, PitchArt, Row, SectionHeader, Tap, Txt, useDir, type IconName } from '@/components/ui';
import { dateFromOffset, formatDay, formatHour, fromISODate, offsetOf } from '@/i18n/format';
import type { StringKey } from '@/i18n/strings';
import { useApp } from '@/store/AppStore';
import { bookingPhase, matchPhase } from '@/lib/matchPhase';
import { useNotifications } from '@/store/notifications';
import { colors, fonts, radius, space } from '@/theme';

type Upcoming = { key: string; kind: 'booking' | 'match'; when: number; title: string; sub: string; onPress: () => void };

export default function Home() {
  const app = useApp();
  const { unread } = useNotifications();
  const { t, l, lang, state, me, allMatches, pitches, tournaments, getPitch, isJoined, myBookings } = app;
  const insets = useSafeAreaInsets();
  const d = useDir();
  const { academies, programs: academyPrograms } = useAcademies();
  const { activeAnnouncement } = useAdmin();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const focused = useIsFocused();
  const labels = { today: t('today'), tomorrow: t('tomorrow') };

  const upcoming: Upcoming[] = useMemo(() => {
    const items: Upcoming[] = [];
    for (const b of myBookings) {
      if (b.status !== 'confirmed') continue;
      if (bookingPhase(b) === 'ended') continue;
      const off = offsetOf(fromISODate(b.dateISO));
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
      if (!isJoined(m.id) || matchPhase(m) === 'ended') continue;
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
  }, [myBookings, allMatches, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearby = allMatches.filter((m) => matchPhase(m) === 'upcoming' && !isJoined(m.id) && !m.isPrivate).slice(0, 5);
  const topPitches = [...pitches].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const live = tournaments.find((x) => x.status === 'live');

  const quick: { icon: IconName; label: StringKey; onPress: () => void }[] = [
    { icon: 'calendar-outline', label: 'quickBook', onPress: () => router.push('/pitches') },
    { icon: 'people-outline', label: 'quickJoin', onPress: () => router.push('/matches') },
    { icon: 'add-circle-outline', label: 'quickCreate', onPress: () => router.push('/match/create') },
    { icon: 'trophy-outline', label: 'quickCups', onPress: () => router.push('/tournaments') },
  ];

  const firstName = state.profile.name.split(' ')[0] || l(me.name);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
      {focused && <StatusBar style="light" />}
      {/* Header band */}
      <View style={{ backgroundColor: colors.primary, paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: 64, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: space.lg }}>
        <Row justify="space-between">
          <Row gap={space.md} style={{ flex: 1 }}>
            <Tap onPress={() => router.push('/profile')}>
              <Avatar name={state.profile.name || 'Me'} size={44} color={colors.accentDark} uri={state.profile.avatarUrl} />
            </Tap>
            <View style={{ flex: 1 }}>
              <Txt v="h3" color={colors.white} numberOfLines={1}>
                {t('greeting', { name: firstName })}
              </Txt>
              <Txt v="caption" color="rgba(255,255,255,0.7)">
                {t('greetingSub')}
              </Txt>
            </View>
          </Row>
          <Row gap={8}>
            <IconButton icon="search" label="search" color={colors.white} bg="rgba(255,255,255,0.12)" onPress={() => router.push('/pitches')} />
            <IconButton icon="notifications-outline" label="notifications" color={colors.white} bg="rgba(255,255,255,0.12)" badge={unread > 0} onPress={() => router.push('/notifications')} />
          </Row>
        </Row>

        {/* Summary card, like an account balance */}
        <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', gap: space.md, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 24, borderColor: 'rgba(124,192,245,0.10)', top: -60, [d.isRTL ? 'left' : 'right']: -50 }} />
          <Row justify="space-between">
            <Txt v="caption" color="rgba(255,255,255,0.75)">
              {t('yourActivity')} · {t('thisSeason')}
            </Txt>
            <Tap onPress={() => router.push('/profile')} hitSlop={10}>
              <Ionicons name={d.forward} size={18} color="rgba(255,255,255,0.8)" />
            </Tap>
          </Row>
          <Row gap={6} align="flex-end">
            <Txt style={{ fontSize: 34, lineHeight: 42, fontFamily: fonts.bold }} color={colors.white}>
              {me.stats.rating.toFixed(1)}
            </Txt>
            <Txt v="caption" color={colors.accent} style={{ marginBottom: 6 }}>
              {t('rating')}
            </Txt>
          </Row>
          <Row>
            {[
              [me.stats.matches, t('matchesPlayed')],
              [me.stats.goals, t('goals')],
              [myBookings.filter((x) => x.status === 'confirmed').length, t('bookingsCount')],
            ].map(([v, label], i) => (
              <View key={i} style={{ flex: 1, gap: 0, borderColor: 'rgba(255,255,255,0.12)', [d.isRTL ? 'borderRightWidth' : 'borderLeftWidth']: i === 0 ? 0 : 1, paddingHorizontal: i === 0 ? 0 : space.md }}>
                <Txt v="h3" color={colors.white}>
                  {v}
                </Txt>
                <Txt v="tiny" color="rgba(255,255,255,0.65)">
                  {label}
                </Txt>
              </View>
            ))}
          </Row>
        </LinearGradient>
      </View>

      {/* Quick actions */}
      <View style={{ paddingHorizontal: space.lg, marginTop: -44 }}>
        <Card style={{ paddingVertical: space.lg, paddingHorizontal: space.sm }}>
          <Row>
            {quick.map((q) => (
              <Tap key={q.label} onPress={q.onPress} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={q.icon} size={24} color={colors.primary} />
                </View>
                <Txt v="tiny" center numberOfLines={1}>
                  {t(q.label)}
                </Txt>
              </Tap>
            ))}
          </Row>
        </Card>
      </View>

      {/* Announcement from the app team */}
      {activeAnnouncement && dismissed !== activeAnnouncement.id && (
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <Row gap={space.md} align="flex-start" style={{ backgroundColor: colors.infoSoft, borderRadius: radius.lg, padding: space.md }}>
            <Ionicons name="megaphone" size={20} color={colors.info} />
            <Txt v="caption" color={colors.text} style={{ flex: 1 }}>
              {l(activeAnnouncement.body)}
            </Txt>
            <Tap onPress={() => setDismissed(activeAnnouncement.id)} hitSlop={10} accessibilityLabel="close">
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Tap>
          </Row>
        </View>
      )}

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
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(124,192,245,0.18)', alignItems: 'center', justifyContent: 'center' }}>
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

      {/* Academies */}
      <View style={{ marginTop: space.lg }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <SectionHeader title={t('academies')} action={t('seeAll')} onAction={() => router.push('/academies')} />
        </View>
        <HScroll>
          {academies.map((a) => (
            <AcademyCard key={a.id} academy={a} programsCount={academyPrograms.filter((p) => p.academyId === a.id).length} compact />
          ))}
        </HScroll>
      </View>
    </ScrollView>
  );
}
