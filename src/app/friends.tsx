/** "ربعي": friends list, incoming requests and player search. */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Button, Card, EmptyState, Row, Segmented, Txt, webNoOutline } from '@/components/ui';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';

type Tab = 'friends' | 'requests' | 'find';

export default function Friends() {
  const { t, mode, meId, errText, players } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const live = mode === 'live';
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'friends');
  const [list, setList] = useState<api.Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; avatarUrl?: string; position: string; level: string }[]>([]);

  const load = useCallback(async () => {
    if (!live) {
      setList(players.filter((p) => p.id !== meId).slice(0, 4).map((p, i) => ({ id: p.id, name: p.name.ar, avatarUrl: p.avatarUrl, position: p.position, level: p.level, status: i === 3 ? 'pending' : 'accepted', incoming: i === 3 })));
      return;
    }
    setLoading(true);
    setList(await api.myFriends().catch(() => []));
    setLoading(false);
  }, [live, players, meId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'find' || q.trim().length < 2) return setResults([]);
    const h = setTimeout(async () => {
      if (!live) return setResults(players.filter((p) => p.id !== meId && p.name.ar.includes(q.trim())).map((p) => ({ id: p.id, name: p.name.ar, avatarUrl: p.avatarUrl, position: p.position, level: p.level })));
      setResults((await api.searchPlayers(q.trim()).catch(() => [])).filter((r) => r.id !== meId));
    }, 350);
    return () => clearTimeout(h);
  }, [q, tab, live, players, meId]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      if (live) await fn();
      toast(okMsg, 'success');
      load();
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
  };

  const friends = list.filter((f) => f.status === 'accepted');
  const incoming = list.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = list.filter((f) => f.status === 'pending' && !f.incoming);
  const statusOf = (id: string) => list.find((f) => f.id === id);

  const PersonRow = ({ p, right }: { p: { id: string; name: string; avatarUrl?: string; position: string; level: string }; right?: React.ReactNode }) => (
    <Card onPress={() => router.push(`/player/${p.id}`)}>
      <Row gap={space.md}>
        <Avatar name={p.name || '?'} uri={p.avatarUrl} size={44} />
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong" numberOfLines={1}>{p.name || t('player')}</Txt>
          <Txt v="caption" color={colors.textMuted}>
            {t(`pos_${p.position}` as never)} · {t(`level_${p.level}` as never)}
          </Txt>
        </View>
        {right}
      </Row>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('myFriends')} />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'friends', label: `${t('friendsTab')} (${friends.length})` },
            { value: 'requests', label: incoming.length ? `${t('requestsTab')} (${incoming.length})` : t('requestsTab') },
            { value: 'find', label: t('searchTab') },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
        refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'friends' &&
          (friends.length === 0 ? (
            <EmptyState icon="people-outline" title={t('noFriends')} body={t('noFriendsSub')} action={t('searchTab')} onAction={() => setTab('find')} />
          ) : (
            friends.map((f) => <PersonRow key={f.id} p={f} />)
          ))}

        {tab === 'requests' && (
          <>
            {incoming.length === 0 && outgoing.length === 0 && <EmptyState icon="mail-outline" title={t('noRequests')} />}
            {incoming.map((f) => (
              <PersonRow
                key={f.id}
                p={f}
                right={
                  <Row gap={6}>
                    <Button title={t('accept')} small onPress={() => act(() => api.friendRespond(f.id, true), t('friendAdded'))} />
                    <Button title={t('decline')} small kind="ghost" onPress={() => act(() => api.friendRespond(f.id, false), t('done'))} />
                  </Row>
                }
              />
            ))}
            {outgoing.length > 0 && (
              <Txt v="label" color={colors.textMuted} style={{ marginTop: space.md }}>
                {t('sentRequests')}
              </Txt>
            )}
            {outgoing.map((f) => (
              <PersonRow key={f.id} p={f} right={<Button title={t('cancel')} small kind="ghost" onPress={() => act(() => api.friendRemove(f.id), t('done'))} />} />
            ))}
          </>
        )}

        {tab === 'find' && (
          <>
            <TextInput
              value={q}
              onChangeText={setQ}
              autoFocus
              placeholder={t('searchPlayersPh')}
              placeholderTextColor={colors.textFaint}
              style={{ height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.regular, ...webNoOutline }}
            />
            {q.trim().length >= 2 && results.length === 0 && <EmptyState icon="search-outline" title={t('noResults')} />}
            {results.map((r) => {
              const s = statusOf(r.id);
              return (
                <PersonRow
                  key={r.id}
                  p={r}
                  right={
                    s?.status === 'accepted' ? (
                      <Txt v="caption" color={colors.success}>{t('alreadyFriends')}</Txt>
                    ) : s?.status === 'pending' && !s.incoming ? (
                      <Txt v="caption" color={colors.textMuted}>{t('requestSent')}</Txt>
                    ) : (
                      <Button title={t('addFriend')} small icon="person-add" onPress={() => act(() => api.friendRequest(r.id), t('requestSentToast'))} />
                    )
                  }
                />
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
