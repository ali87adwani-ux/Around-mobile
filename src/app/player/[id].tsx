import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { MatchCard } from '@/components/cards';
import { useToast } from '@/components/overlays';
import { PlayerCard } from '@/components/PlayerCard';
import { ReportSheet } from '@/components/ReportSheet';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, IconButton, Row, Stat, Txt } from '@/components/ui';
import * as api from '@/lib/api';
import { matchPhase } from '@/lib/matchPhase';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, getPlayer, allMatches, mode, meId, errText } = useApp();
  const toast = useToast();
  const live = mode === 'live';
  const p = getPlayer(id);
  const games = allMatches.filter((m) => matchPhase(m) !== 'ended' && m.playerIds.includes(p.id) && !m.isPrivate).slice(0, 3);
  const winRate = p.stats.matches ? Math.round((p.stats.wins / p.stats.matches) * 100) : 0;
  const [conduct, setConduct] = useState<{ avg: number | null; count: number } | null>(null);
  const [friend, setFriend] = useState<api.Friend | null | undefined>(undefined);
  const [reporting, setReporting] = useState(false);
  const isMe = id === meId;

  useEffect(() => {
    if (!live) {
      setConduct({ avg: 4.6, count: 12 });
      setFriend(null);
      return;
    }
    api.playerConduct(id).then(setConduct).catch(() => {});
    if (!isMe) api.myFriends().then((fs) => setFriend(fs.find((f) => f.id === id) ?? null)).catch(() => setFriend(null));
  }, [id, live, isMe]);

  const addFriend = async () => {
    try {
      const s = live ? await api.friendRequest(id) : 'pending';
      setFriend({ id, name: l(p.name), position: p.position, level: p.level, status: s, incoming: false });
      toast(s === 'accepted' ? t('friendAdded') : t('requestSentToast'), 'success');
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('playerProfile')} right={!isMe ? <IconButton icon="flag-outline" label={t('reportPlayer')} onPress={() => setReporting(true)} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        <PlayerCard player={p} />
        {!isMe && friend !== undefined && (
          friend?.status === 'accepted' ? (
            <Row gap={6} justify="center">
              <Ionicons name="people" size={18} color={colors.success} />
              <Txt v="bodyStrong" color={colors.success}>{t('alreadyFriends')}</Txt>
            </Row>
          ) : friend?.status === 'pending' && !friend.incoming ? (
            <Button title={t('requestSent')} kind="secondary" icon="time-outline" disabled />
          ) : (
            <Button title={friend?.incoming ? t('acceptFriend') : t('addFriend')} icon="person-add" onPress={addFriend} />
          )
        )}
        <Card>
          <Row>
            <Stat icon="trophy-outline" value={p.stats.wins} label={t('wins')} />
            <Stat icon="pie-chart-outline" value={`${winRate}%`} label={t('wins') + ' %'} color={colors.info} />
            <Stat
              icon="heart-outline"
              value={conduct?.avg != null ? `${conduct.avg}★` : '—'}
              label={conduct?.avg != null ? t('conductN', { n: conduct.count }) : t('conductNew')}
              color={colors.success}
            />
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
      <ReportSheet userId={id} name={l(p.name)} visible={reporting} onClose={() => setReporting(false)} />
    </View>
  );
}
