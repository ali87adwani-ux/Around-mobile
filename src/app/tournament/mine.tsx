/** Organiser hub: my tournaments (any status), create a new one, and organising fees owed. */
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { statusBadge } from '@/components/cards';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, EmptyState, Row, Txt } from '@/components/ui';
import type { DuesRow } from '@/data/types';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function MyTournaments() {
  const { t, l, money, tournaments, meId, role, mode, refresh, loading } = useApp();
  const insets = useSafeAreaInsets();
  const [dues, setDues] = useState<DuesRow[]>([]);
  const mine = tournaments.filter((x) => x.organizerId === meId);

  const load = useCallback(() => {
    if (mode === 'live' && role !== 'admin') api.fetchDues(true).then(setDues).catch(() => {});
  }, [mode, role]);
  useEffect(load, [load]);

  const owed = dues.filter((d) => !d.settled).reduce((s, d) => s + d.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('myTournaments')} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { refresh(); load(); }} tintColor={colors.primary} />}
      >
        <Button title={t('newTournament')} icon="add" onPress={() => router.push('/tournament/new')} />

        {role !== 'admin' && dues.length > 0 && (
          <Card style={{ gap: space.sm, borderWidth: owed > 0 ? 1 : 0, borderColor: colors.warning }}>
            <Row justify="space-between">
              <Txt v="h3">{t('organizingFees')}</Txt>
              <Txt v="h3" color={owed > 0 ? colors.warning : colors.success}>
                {money(owed)}
              </Txt>
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {owed > 0 ? t('feesOwedHint') : t('feesAllSettled')}
            </Txt>
            {dues.map((d) => (
              <Row key={d.tournamentId} justify="space-between">
                <Txt v="caption" style={{ flex: 1 }} numberOfLines={1}>
                  {l(d.name)} · {t('paidTeamsN', { n: d.paidTeams })}
                </Txt>
                <Txt v="label" color={d.settled ? colors.success : colors.text}>
                  {money(d.amount)} {d.settled ? '✓' : ''}
                </Txt>
              </Row>
            ))}
          </Card>
        )}

        {mine.length === 0 ? (
          <EmptyState icon="trophy-outline" title={t('noTournamentsYet')} body={t('noTournamentsYetSub')} />
        ) : (
          mine.map((x) => (
            <Card key={x.id} onPress={() => router.push(`/tournament/manage/${x.id}`)} style={{ gap: 6 }}>
              <Row justify="space-between" gap={space.sm}>
                <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
                  {l(x.name)}
                </Txt>
                <View style={{ transform: [{ scale: 0.95 }] }}>{statusBadge(x.status, t)}</View>
              </Row>
              <Txt v="caption" color={colors.textMuted}>
                {t(`fmt_${x.formatType ?? 'league'}`)} · {t('teamsCount', { n: x.teams.filter((tm) => tm.status !== 'rejected' && tm.status !== 'withdrawn').length, max: x.maxTeams })} ·{' '}
                {money(x.entryFee)}
              </Txt>
              {x.status === 'rejected' && !!x.rejectReason && (
                <Txt v="caption" color={colors.danger}>
                  {x.rejectReason}
                </Txt>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
