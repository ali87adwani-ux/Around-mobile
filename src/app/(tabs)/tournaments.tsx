import React, { useState } from 'react';
import { FlatList, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TournamentCard } from '@/components/cards';
import { router } from 'expo-router';
import { Chip, EmptyState, HScroll, IconButton, Row, Txt } from '@/components/ui';
import type { Tournament } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function Tournaments() {
  const { t, tournaments, refresh, mode, loading, meId, isOwner, role } = useApp();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Tournament['status'] | null>(null);
  const order: Record<Tournament['status'], number> = { live: 0, open: 1, closed: 2, pending: 3, finished: 4, rejected: 5, cancelled: 6 };
  // Players see published tournaments; organisers also see their own drafts.
  const visible = tournaments.filter((x) => ['open', 'closed', 'live', 'finished'].includes(x.status) || x.organizerId === meId);
  const list = visible.filter((x) => !status || x.status === status || (status === 'open' && x.status === 'closed')).sort((a, b) => order[a.status] - order[b.status]);
  const canOrganize = isOwner || role === 'admin';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + space.md, gap: space.md, paddingBottom: space.sm }}>
        <Row justify="space-between" style={{ paddingHorizontal: space.lg }}>
          <Txt v="h1">{t('tournaments')}</Txt>
          <Row gap={8}>
            <IconButton icon="key-outline" label={t('joinWithCode')} onPress={() => router.push('/tournament/join')} />
            {canOrganize && <IconButton icon="add" label={t('newTournament')} color={colors.white} bg={colors.primary} onPress={() => router.push('/tournament/mine')} />}
          </Row>
        </Row>
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
