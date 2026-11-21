/** Group chat for the players of one game (live updates). */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, EmptyState, IconButton, Row, Tap, Txt, webNoOutline } from '@/components/ui';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';

export default function MatchChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, mode, meId, getMatch, getPitch, getPlayer, errText, isJoined } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const match = getMatch(id);
  const live = mode === 'live';
  const [msgs, setMsgs] = useState<api.ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<api.ChatMessage>>(null);
  const allowed = !!match && (match.organizerId === meId || isJoined(match.id));

  useEffect(() => {
    if (!live || !allowed) return;
    api.fetchChat(id).then(setMsgs).catch(() => {});
    return api.subscribeChat(
      id,
      (m) => setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])),
      (mid) => setMsgs((cur) => cur.filter((x) => x.id !== mid)),
    );
  }, [id, live, allowed]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [msgs.length]);

  if (!match || !allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('gameChat')} />
        <EmptyState icon="chatbubbles-outline" title={t('chatPlayersOnly')} />
      </View>
    );
  }

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    if (!live) {
      setMsgs((cur) => [...cur, { id: `l${Date.now()}`, userId: meId, body, at: Date.now() }]);
      return;
    }
    setSending(true);
    try {
      await api.sendChat(id, body);
    } catch (e) {
      setText(body);
      toast(errText(api.errorCode(e)), 'error');
    }
    setSending(false);
  };

  const time = (at: number) => new Date(at).toLocaleTimeString(lang === 'ar' ? 'ar-KW' : 'en', { hour: 'numeric', minute: '2-digit' });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('gameChat')} right={<IconButton icon="information-circle-outline" label={t('gameDetails')} onPress={() => router.back()} />} />
      <Txt v="caption" color={colors.textMuted} center style={{ marginBottom: space.sm }}>
        {l(getPitch(match.pitchId).name)} · {match.playerIds.length} {t('players')}
      </Txt>
      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title={t('chatEmpty')} body={t('chatEmptySub')} />}
        renderItem={({ item: m }) => {
          const mine = m.userId === meId;
          const p = getPlayer(m.userId);
          return (
            <Row gap={8} align="flex-end" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', flexDirection: mine ? 'row-reverse' : 'row' }}>
              {!mine && <Avatar name={l(p.name)} color={p.color} uri={p.avatarUrl} size={28} />}
              <Tap
                onLongPress={async () => {
                  if (!mine || !live) return;
                  await api.deleteChat(m.id).catch(() => {});
                  setMsgs((cur) => cur.filter((x) => x.id !== m.id));
                }}
                style={{ backgroundColor: mine ? colors.primary : colors.card, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8, gap: 2, borderWidth: mine ? 0 : 1, borderColor: colors.border }}
              >
                {!mine && (
                  <Txt v="tiny" color={colors.primary}>
                    {l(p.name)}
                  </Txt>
                )}
                <Txt v="body" color={mine ? colors.white : colors.text}>
                  {m.body}
                </Txt>
                <Txt v="tiny" color={mine ? 'rgba(255,255,255,0.7)' : colors.textFaint}>
                  {time(m.at)}
                </Txt>
              </Tap>
            </Row>
          );
        }}
      />
      <Row gap={8} style={{ padding: space.md, paddingBottom: insets.bottom + space.md, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <TextInput
          value={text}
          onChangeText={(v) => setText(v.slice(0, 500))}
          placeholder={t('chatPlaceholder')}
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={send}
          returnKeyType="send"
          style={{ flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, color: colors.text, fontFamily: fonts.regular, textAlign: lang === 'ar' ? 'right' : 'left', ...webNoOutline }}
        />
        <IconButton icon="send" label={t('send')} bg={colors.primary} color={colors.white} size={44} onPress={sending || !text.trim() ? undefined : send} />
      </Row>
    </KeyboardAvoidingView>
  );
}
