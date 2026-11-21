import React, { useState } from 'react';
import { FlatList, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TournamentCard } from '@/components/cards';
import { Chip, EmptyState, HScroll, Txt } from '@/components/ui';
import type { Tournament } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function Tournaments() {
  const { t, tournaments, refresh, mode, loading } = useApp();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Tournament['status'] | null>(null);
  const order = { live: 0, open: 1, finished: 2 };
  const list = tournaments.filter((x) => !status || x.status === status).sort((a, b) => order[a.status] - order[b.status]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + space.md, gap: space.md, paddingBottom: space.sm }}>
        <Txt v="h1" style={{ paddingHorizontal: space.lg }}>
          {t('tournaments')}
        </Txt>
        <HScroll gap={8}>
          <Chip label={t('all')} selected={!status} onPress={() => setStatus(null)} />
          <Chip label={t('status_live')} icon="radio-button-on" selected={status === 'live'} onPress={() => setStatus('live')} />
          <Chip label={t('status_open')} icon="create-outline" selected={status === 'open'} onPress={() => setStatus('open')} />
          <Chip label={t('status_finished')} icon="flag-outline" selected={status === 'finished'} onPress={() => setStatus('finished')} />
        </HScroll>
      </View>
      <FlatList
        refreshControl={mode === 'live' ? <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} /> : undefined}
        data={list}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => <TournamentCard tournament={item} />}
        contentContainerStyle={{ padding: space.lg, paddingTop: space.xs, gap: space.lg }}
        ListEmptyComponent={<EmptyState icon="trophy-outline" title={t('noResults')} />}
      />
    </View>
  );
}
