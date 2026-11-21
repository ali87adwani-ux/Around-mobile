import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Card, Row, Segmented, Tap, Txt } from '@/components/ui';
import type { Player } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';

type Metric = 'goals' | 'rating' | 'mvp';
const medal = ['#E8B923', '#A8B2BD', '#C7844B'];

export default function Leaderboard() {
  const { t, l, players, me } = useApp();
  const [metric, setMetric] = useState<Metric>('goals');
  const val = (p: Player) => (metric === 'rating' ? p.stats.rating : p.stats[metric]);
  const list = [...players, me].sort((a, b) => val(b) - val(a));
  const fmt = (p: Player) => (metric === 'rating' ? val(p).toFixed(1) : String(val(p)));
  const top = list.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('leaderboard')} />
      <FlatList
        data={list.slice(3)}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.sm }}
        ListHeaderComponent={
          <View style={{ gap: space.xl, marginBottom: space.md }}>
            <Segmented
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'goals', label: t('topScorers') },
                { value: 'rating', label: t('topRated') },
                { value: 'mvp', label: t('mostMvp') },
              ]}
            />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: space.md }}>
              {podiumOrder.map((p, i) => {
                if (!p) return null;
                const rank = i === 1 ? 0 : i === 0 ? 1 : 2;
                const h = [130, 100, 80][rank];
                return (
                  <Tap key={p.id} onPress={() => p.id !== 'me' && router.push(`/player/${p.id}`)} style={{ alignItems: 'center', flex: 1, gap: 6 }}>
                    {rank === 0 && <Ionicons name="trophy" size={22} color={medal[0]} />}
                    <Avatar name={l(p.name)} color={p.color} uri={p.avatarUrl} size={rank === 0 ? 64 : 52} ring />
                    <Txt v="label" center numberOfLines={1}>
                      {p.id === 'me' ? t('you') : l(p.name).split(' ')[0]}
                    </Txt>
                    <View style={{ width: '100%', height: h, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, backgroundColor: rank === 0 ? colors.primary : colors.primarySoft, alignItems: 'center', paddingTop: space.md }}>
                      <Txt v="h1" color={rank === 0 ? colors.accent : colors.primary} center>
                        {rank + 1}
                      </Txt>
                      <Txt v="label" color={rank === 0 ? colors.white : colors.primaryDark} center>
                        {fmt(p)}
                      </Txt>
                    </View>
                  </Tap>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item: p, index }) => (
          <Card onPress={p.id !== 'me' ? () => router.push(`/player/${p.id}`) : undefined} style={{ paddingVertical: space.md, backgroundColor: p.id === 'me' ? colors.primarySoft : colors.card }}>
            <Row gap={space.md}>
              <Txt v="label" color={colors.textMuted} center style={{ width: 24 }}>
                {index + 4}
              </Txt>
              <Avatar name={l(p.name)} color={p.color} uri={p.avatarUrl} size={40} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{p.id === 'me' ? t('you') : l(p.name)}</Txt>
                <Txt v="tiny" color={colors.textMuted}>
                  {t(`pos_${p.position}`)}
                </Txt>
              </View>
              <Txt v="h3" color={colors.primary}>
                {fmt(p)}
              </Txt>
            </Row>
          </Card>
        )}
      />
    </View>
  );
}
