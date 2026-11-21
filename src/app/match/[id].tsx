import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import * as Linking from 'expo-linking';
import { Linking as RNLinking, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LevelBadge } from '@/components/cards';
import { ConfirmSheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Badge, Button, Card, EmptyState, IconButton, PitchArt, Progress, Row, Tap, Txt, useDir } from '@/components/ui';
import { dateFromOffset, formatDay, formatDuration, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, radius, shadow, space } from '@/theme';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, money, getMatch, getPitch, getPlayer, matchPlayers, isJoined, joinMatch, leaveMatch, errText, meId } = useApp();
  const [busyAction, setBusyAction] = useState(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const d = useDir();
  const [leaving, setLeaving] = useState(false);
  const match = getMatch(id);

  if (!match) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="football-outline" title={t('noResults')} />
      </View>
    );
  }

  const pitch = getPitch(match.pitchId);
  const ids = matchPlayers(match);
  const joined = isJoined(match.id);
  const left = match.maxPlayers - ids.length;
  const half = match.maxPlayers / 2;
  const teamA = Array.from({ length: half }, (_, i) => ids[i * 2]);
  const teamB = Array.from({ length: half }, (_, i) => ids[i * 2 + 1]);
  const organizer = getPlayer(match.organizerId);
  const date = dateFromOffset(match.dayOffset);
  const when = `${formatDay(date, lang, { today: t('today'), tomorrow: t('tomorrow') })} · ${formatHour(match.hour, lang)} – ${formatHour(match.hour + match.duration, lang)}`;

  const shareText = `${t('appName')} ⚽ ${l(pitch.name)} — ${when} — ${t('spotsLeft', { n: Math.max(left, 0) })}\n${Linking.createURL(`match/${match.id}`)}`;
  const share = () => Share.share({ message: shareText }).catch(() => {});
  const shareWhatsapp = () => RNLinking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`).catch(share);

  const Slot = ({ pid }: { pid?: string }) => {
    if (!pid)
      return (
        <View style={{ alignItems: 'center', gap: 4, width: 64 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={20} color="rgba(255,255,255,0.8)" />
          </View>
          <Txt v="tiny" color="rgba(255,255,255,0.75)" center numberOfLines={1}>
            {t('openSpot')}
          </Txt>
        </View>
      );
    const p = getPlayer(pid);
    const isMe = pid === meId;
    return (
      <Tap onPress={() => !isMe && router.push(`/player/${pid}`)} style={{ alignItems: 'center', gap: 4, width: 64 }}>
        <View>
          <Avatar name={l(p.name)} color={isMe ? colors.accentDark : p.color} uri={p.avatarUrl} size={44} ring />
          <View style={{ position: 'absolute', bottom: -4, alignSelf: 'center', backgroundColor: colors.text, borderRadius: 6, paddingHorizontal: 4 }}>
            <Txt v="tiny" color={colors.white} center style={{ fontSize: 9, lineHeight: 13 }}>
              {t(`posShort_${p.position}`)}
            </Txt>
          </View>
        </View>
        <Txt v="tiny" color={colors.white} center numberOfLines={1}>
          {isMe ? t('you') : l(p.name).split(' ')[0]}
        </Txt>
      </Tap>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('gameDetails')} right={<IconButton icon="share-social-outline" label="share" onPress={share} />} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: space.md }}>
          <Row gap={6}>
            <Badge label={`${match.format}×${match.format}`} icon="football-outline" />
            <LevelBadge level={match.level} />
            {joined && <Badge label={t('joined')} icon="checkmark-circle" />}
          </Row>
          <Tap onPress={() => router.push(`/pitch/${pitch.id}`)} scale={0.99}>
            <Row gap={6}>
              <Txt v="h1" style={{ flexShrink: 1 }}>
                {l(pitch.name)}
              </Txt>
              <Ionicons name={d.forward} size={18} color={colors.textFaint} />
            </Row>
          </Tap>
          {[
            ['calendar-outline', when],
            ['hourglass-outline', formatDuration(match.duration, lang)],
            ['location-outline', `${l(pitch.area)} — ${l(pitch.address)}`],
            ['cash-outline', `${money(match.pricePerPlayer)} ${t('perPlayer')}`],
          ].map(([icon, text]) => (
            <Row key={icon} gap={10}>
              <Ionicons name={icon as 'calendar-outline'} size={18} color={colors.primary} />
              <Txt v="body" style={{ flex: 1 }}>
                {text}
              </Txt>
            </Row>
          ))}
          <View style={{ gap: 6, marginTop: 4 }}>
            <Row justify="space-between">
              <Txt v="label">
                {ids.length}/{match.maxPlayers} {t('players')}
              </Txt>
              <Txt v="label" color={left > 0 ? (left <= 2 ? colors.danger : colors.primary) : colors.textMuted}>
                {left > 0 ? (left === 1 ? t('spotLeft1') : t('spotsLeft', { n: left })) : t('full')}
              </Txt>
            </Row>
            <Progress value={ids.length / match.maxPlayers} height={8} />
          </View>
        </Card>

        {/* Lineup on a pitch */}
        <View style={{ gap: space.md }}>
          <Txt v="h2">{t('lineup')}</Txt>
          <PitchArt tint={[colors.primary, '#1E56B3']} height={Math.max(320, half * 60 + 80)}>
            <View style={{ flex: 1, flexDirection: 'row', padding: space.lg }}>
              {[teamA, teamB].map((team, ti) => (
                <View key={ti} style={{ flex: 1, alignItems: 'center', gap: space.sm }}>
                  <Txt v="label" color={ti === 0 ? colors.accent : colors.white} center>
                    {ti === 0 ? t('teamA') : t('teamB')}
                  </Txt>
                  <View style={{ flex: 1, justifyContent: 'space-evenly', alignItems: 'center' }}>
                    {team.map((pid, i) => (
                      <Slot key={i} pid={pid} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </PitchArt>
        </View>

        {/* Organizer */}
        <Card onPress={() => router.push(`/player/${organizer.id}`)}>
          <Row gap={space.md}>
            <Avatar name={l(organizer.name)} color={organizer.color} uri={organizer.avatarUrl} size={48} />
            <View style={{ flex: 1 }}>
              <Txt v="tiny" color={colors.textMuted}>
                {t('organizer')}
              </Txt>
              <Txt v="h3">{match.organizerId === meId ? t('you') : l(organizer.name)}</Txt>
            </View>
            <Row gap={4}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Txt v="label">{organizer.stats.rating.toFixed(1)}</Txt>
            </Row>
          </Row>
        </Card>
      </ScrollView>

      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: space.lg, paddingBottom: insets.bottom + space.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }, shadow]}>
        {joined ? (
          <Row gap={space.sm}>
            <Button title={t('shareWhatsapp')} icon="logo-whatsapp" onPress={shareWhatsapp} style={{ flex: 1 }} />
            <Button title={t('leave')} kind="danger" onPress={() => setLeaving(true)} style={{ flex: 1 }} />
          </Row>
        ) : (
          <Button
            title={left > 0 ? t('joinGame', { price: money(match.pricePerPlayer) }) : t('full')}
            disabled={left <= 0}
            icon="person-add"
            loading={busyAction}
            onPress={async () => {
              setBusyAction(true);
              const r = await joinMatch(match.id);
              setBusyAction(false);
              if (r.ok) toast(t('joinedToast'));
              else toast(errText(r.error), 'error');
            }}
          />
        )}
      </View>

      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        title={t('leaveConfirm')}
        body={t('leaveConfirmSub')}
        confirmLabel={t('leaveGame')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={async () => {
          setLeaving(false);
          const created = match.createdByMe || (match.organizerId === meId && ids.length <= 1);
          const r = await leaveMatch(match.id);
          if (!r.ok) return toast(errText(r.error), 'error');
          toast(t('leftToast'), 'info');
          if (created) router.back();
        }}
      />
    </View>
  );
}
