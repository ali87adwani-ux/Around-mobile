import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { MatchCard } from '@/components/cards';
import { PlayerCard } from '@/components/PlayerCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Row, Stat, Txt } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, getPlayer, allMatches } = useApp();
  const p = getPlayer(id);
  const games = allMatches.filter((m) => m.dayOffset >= 0 && m.playerIds.includes(p.id)).slice(0, 3);
  const winRate = p.stats.matches ? Math.round((p.stats.wins / p.stats.matches) * 100) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('playerProfile')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        <PlayerCard player={p} />
        <Card>
          <Row>
            <Stat icon="trophy-outline" value={p.stats.wins} label={t('wins')} />
            <Stat icon="pie-chart-outline" value={`${winRate}%`} label={t('wins') + ' %'} color={colors.info} />
            <Stat icon="location-outline" value={l(p.area).split(' ')[0]} label={l(p.area)} color={colors.warning} />
          </Row>
        </Card>
        {games.length > 0 && (
          <View style={{ gap: space.md }}>
            <Row gap={8}>
              <Ionicons name="football" size={18} color={colors.primary} />
              <Txt v="h2">{t('upcoming')}</Txt>
            </Row>
            {games.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
