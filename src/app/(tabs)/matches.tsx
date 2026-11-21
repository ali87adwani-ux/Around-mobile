import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MatchCard } from '@/components/cards';
import { Chip, EmptyState, HScroll, IconButton, Row, Segmented, Tap, Txt, useDir } from '@/components/ui';
import type { Level, PitchSize } from '@/data/types';
import { dateFromOffset, formatDay } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { matchPhase, matchTimes } from '@/lib/matchPhase';
import { colors, radius, shadow, space } from '@/theme';

export default function Matches() {
  const { t, lang, allMatches, isJoined, refresh, mode, loading } = useApp();
  const insets = useSafeAreaInsets();
  const d = useDir();
  const [tab, setTab] = useState<'discover' | 'mine'>('discover');
  const [day, setDay] = useState<number | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [size, setSize] = useState<PitchSize | null>(null);

  const past = useMemo(() => allMatches.filter((m) => matchPhase(m) === 'ended' && isJoined(m.id)).sort((a, b) => matchTimes(b).start - matchTimes(a).start), [allMatches, isJoined]);
  const list = useMemo(() => {
    return allMatches
      .filter((m) => matchPhase(m) !== 'ended')
      // Discover only shows games you can still join; your own running game stays under "My games".
      .filter((m) => (tab === 'mine' ? isJoined(m.id) : matchPhase(m) === 'upcoming' && (!m.isPrivate || isJoined(m.id))))
      .filter((m) => (day == null ? true : m.dayOffset === day))
      .filter((m) => (level ? m.level === level : true))
      .filter((m) => (size ? m.format === size : true))
      .sort((a, b) => a.dayOffset * 24 + a.hour - (b.dayOffset * 24 + b.hour));
  }, [allMatches, tab, day, level, size, isJoined]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + space.md, gap: space.md, paddingBottom: space.sm }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Row justify="space-between">
            <Txt v="h1">{t('pickupGames')}</Txt>
            <IconButton icon="key-outline" label={t('joinGameCode')} onPress={() => router.push('/match/join')} />
          </Row>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'discover', label: t('discover') },
              { value: 'mine', label: t('myGames') },
            ]}
          />
        </View>
        {tab === 'discover' && (
          <HScroll gap={8}>
            <Chip label={t('all')} selected={day == null && !level && !size} onPress={() => { setDay(null); setLevel(null); setSize(null); }} />
            {[0, 1, 2, 3, 4].map((o) => (
              <Chip key={o} label={formatDay(dateFromOffset(o), lang, { today: t('today'), tomorrow: t('tomorrow') })} selected={day === o} onPress={() => setDay(day === o ? null : o)} />
            ))}
            <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 6 }} />
            {(['beginner', 'intermediate', 'advanced'] as Level[]).map((lv) => (
              <Chip key={lv} label={t(`level_${lv}`)} selected={level === lv} onPress={() => setLevel(level === lv ? null : lv)} />
            ))}
            <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 6 }} />
            {([5, 6, 7, 11] as PitchSize[]).map((n) => (
              <Chip key={n} label={`${n}×${n}`} selected={size === n} onPress={() => setSize(size === n ? null : n)} />
            ))}
          </HScroll>
        )}
      </View>
      <FlatList
        refreshControl={mode === 'live' ? <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} /> : undefined}
        data={list}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MatchCard match={item} />}
        ListFooterComponent={
          tab === 'mine' && past.length > 0 ? (
            <View style={{ gap: space.md, marginTop: space.md }}>
              <Txt v="h3">{t('pastGames')}</Txt>
              {past.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </View>
          ) : undefined
        }
        contentContainerStyle={{ padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: 110 }}
        ListEmptyComponent={
          tab === 'mine' ? (
            <EmptyState icon="football-outline" title={t('noMyGames')} body={t('noMyGamesSub')} action={t('discover')} onAction={() => setTab('discover')} />
          ) : (
            <EmptyState icon="search-outline" title={t('noResults')} body={t('noResultsSub')} action={t('clearFilters')} onAction={() => { setDay(null); setLevel(null); setSize(null); }} />
          )
        }
      />
      <Tap
        onPress={() => router.push('/match/create')}
        style={[{ position: 'absolute', bottom: space.lg, [d.isRTL ? 'left' : 'right']: space.lg, height: 56, borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center' }, shadow]}
      >
        <Row gap={8}>
          <Ionicons name="add" size={24} color={colors.accent} />
          <Txt v="h3" color={colors.white}>
            {t('createGame')}
          </Txt>
        </Row>
      </Tap>
    </View>
  );
}
