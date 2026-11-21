import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import type { Match, Pitch, Tournament } from '@/data/types';
import { dateFromOffset, formatDay, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';
import { AvatarStack, Badge, Card, PitchArt, Progress, Row, Tap, Txt, haptic } from './ui';

export function FavButton({ id, size = 36 }: { id: string; size?: number }) {
  const { state, dispatch } = useApp();
  const fav = state.favorites.includes(id);
  return (
    <Tap
      haptics={false}
      onPress={() => {
        haptic.select();
        dispatch({ type: 'toggleFavorite', id });
      }}
      accessibilityLabel="favorite"
      accessibilityState={{ selected: fav }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={fav ? 'heart' : 'heart-outline'} size={size * 0.52} color={fav ? colors.danger : '#0D1B33'} />
    </Tap>
  );
}

export function PitchCard({ pitch, compact }: { pitch: Pitch; compact?: boolean }) {
  const { l, t, money, isRTL } = useApp();
  return (
    <Card onPress={() => router.push(`/pitch/${pitch.id}`)} style={{ padding: 0, width: compact ? 260 : undefined }}>
      <PitchArt tint={pitch.tint} photo={pitch.photos?.[0]} height={compact ? 120 : 150} radiusSize={radius.lg} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <Row justify="space-between" align="flex-start" style={{ padding: space.md, flex: 1 }}>
          <Row gap={6}>
            <Badge label={pitch.indoor ? t('indoor') : t('outdoor')} color={colors.white} bg="rgba(0,0,0,0.28)" icon={pitch.indoor ? 'home' : 'sunny'} />
            <Badge label={pitch.sizes.map((s) => `${s}×${s}`).join(' · ')} color={colors.white} bg="rgba(0,0,0,0.28)" />
          </Row>
          <FavButton id={pitch.id} size={34} />
        </Row>
      </PitchArt>
      <View style={{ padding: space.md, gap: 4 }}>
        <Row justify="space-between" gap={8}>
          <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
            {l(pitch.name)}
          </Txt>
          <Row gap={3}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Txt v="label">{pitch.rating.toFixed(1)}</Txt>
          </Row>
        </Row>
        <Row gap={4}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Txt v="caption" color={colors.textMuted} numberOfLines={1}>
            {l(pitch.area)}{pitch.distanceKm > 0 && pitch.distanceKm < 999 ? ` · ${pitch.distanceKm} ${t('km')}` : ''}{(pitch.courts ?? 1) > 1 ? ` · ${t('courtsN', { n: pitch.courts ?? 1 })}` : ''}
          </Txt>
        </Row>
        <Row gap={2} style={{ marginTop: 2 }}>
          <Txt v="h3" color={colors.primary}>
            {money(pitch.pricePerHour)}
          </Txt>
          <Txt v="caption" color={colors.textMuted}>
            {t('perHour')}
          </Txt>
        </Row>
      </View>
    </Card>
  );
}

const levelColor = { beginner: colors.info, intermediate: colors.warning, advanced: colors.danger } as const;
const levelBg = { beginner: colors.infoSoft, intermediate: colors.warningSoft, advanced: colors.dangerSoft } as const;

export function LevelBadge({ level }: { level: Match['level'] }) {
  const { t } = useApp();
  return <Badge label={t(`level_${level}`)} color={levelColor[level]} bg={levelBg[level]} icon="speedometer-outline" />;
}

export function MatchCard({ match, compact }: { match: Match; compact?: boolean }) {
  const { l, t, money, lang, getPitch, getPlayer, matchPlayers, isJoined } = useApp();
  const pitch = getPitch(match.pitchId);
  const ids = matchPlayers(match);
  const left = match.maxPlayers - ids.length;
  const joined = isJoined(match.id);
  const day = formatDay(dateFromOffset(match.dayOffset), lang, { today: t('today'), tomorrow: t('tomorrow') });
  return (
    <Card onPress={() => router.push(`/match/${match.id}`)} style={{ width: compact ? 280 : undefined, gap: space.md }}>
      <Row gap={space.md}>
        <View style={{ width: 54, height: 58, borderRadius: radius.md, backgroundColor: joined ? colors.primary : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="tiny" color={joined ? colors.accent : colors.primary} center>
            {day.split(/[ ,]/)[0]}
          </Txt>
          <Txt v="h3" color={joined ? colors.white : colors.primaryDark} center style={{ lineHeight: 22 }}>
            {formatHour(match.hour, lang).split(' ')[0]}
          </Txt>
          <Txt v="tiny" color={joined ? colors.accent : colors.primary} center style={{ lineHeight: 14 }}>
            {formatHour(match.hour, lang).split(' ')[1]}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3" numberOfLines={1}>
            {l(pitch.name)}
          </Txt>
          <Txt v="caption" color={colors.textMuted} numberOfLines={1}>
            {day} · {l(pitch.area)}
          </Txt>
          <Row gap={6} style={{ marginTop: 4 }}>
            <Badge label={`${match.format}×${match.format}`} icon="football-outline" />
            <LevelBadge level={match.level} />
          </Row>
        </View>
      </Row>
      <View style={{ gap: 8 }}>
        <Row justify="space-between">
          <AvatarStack names={ids.map((id) => l(getPlayer(id).name))} colorsList={ids.map((id) => getPlayer(id).color)} uris={ids.map((id) => getPlayer(id).avatarUrl)} max={5} size={28} />
          {joined ? (
            <Badge label={t('joined')} icon="checkmark-circle" color={colors.primary} />
          ) : (
            <Txt v="label" color={left <= 2 && left > 0 ? colors.danger : left === 0 ? colors.textMuted : colors.text}>
              {left > 0 ? (left === 1 ? t('spotLeft1') : t('spotsLeft', { n: left })) : t('full')}
            </Txt>
          )}
        </Row>
        <Progress value={ids.length / match.maxPlayers} color={left === 0 ? colors.textFaint : colors.primary} />
        <Row justify="space-between">
          <Txt v="caption" color={colors.textMuted}>
            {ids.length}/{match.maxPlayers} {t('players')}
          </Txt>
          <Row gap={2}>
            <Txt v="label" color={colors.primary}>
              {money(match.pricePerPlayer)}
            </Txt>
            <Txt v="tiny" color={colors.textMuted}>
              {t('perPlayer')}
            </Txt>
          </Row>
        </Row>
      </View>
    </Card>
  );
}

export function statusBadge(status: Tournament['status'], t: ReturnType<typeof useApp>['t']) {
  if (status === 'live') return <Badge label={t('status_live')} color={colors.white} bg={colors.danger} icon="radio-button-on" />;
  if (status === 'open') return <Badge label={t('status_open')} color={colors.primaryDark} bg={colors.accent} icon="create-outline" />;
  if (status === 'closed') return <Badge label={t('status_closed')} color={colors.primaryDark} bg={colors.accent} icon="lock-closed-outline" />;
  if (status === 'pending') return <Badge label={t('status_pending')} color={colors.white} bg={colors.warning} icon="time-outline" />;
  if (status === 'rejected' || status === 'cancelled') return <Badge label={t(`status_${status}`)} color={colors.white} bg="rgba(0,0,0,0.35)" icon="close-circle-outline" />;
  return <Badge label={t('status_finished')} color={colors.white} bg="rgba(255,255,255,0.22)" icon="flag-outline" />;
}

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const { l, t, money, registrationFor } = useApp();
  const reg = registrationFor(tournament.id);
  const teamsN = tournament.teams.filter((tm) => tm.status !== 'rejected' && tm.status !== 'withdrawn').length;
  return (
    <Card onPress={() => router.push(`/tournament/${tournament.id}`)} style={{ padding: 0, overflow: 'hidden' }}>
      <PitchArt tint={tournament.tint} height={140} radiusSize={0}>
        <View style={{ padding: space.lg, flex: 1, justifyContent: 'space-between' }}>
          <Row justify="space-between">
            {statusBadge(tournament.status, t)}
            <Ionicons name="trophy" size={26} color={colors.accent} />
          </Row>
          <View>
            <Txt v="h2" color={colors.white}>
              {l(tournament.name)}
            </Txt>
            <Txt v="caption" color="rgba(255,255,255,0.8)">
              {`${tournament.format}×${tournament.format}`} · {t('teamsCount', { n: teamsN, max: tournament.maxTeams })}
            </Txt>
          </View>
        </View>
      </PitchArt>
      <Row style={{ padding: space.lg }} justify="space-between">
        <View>
          <Txt v="tiny" color={colors.textMuted}>
            {t('prize')}
          </Txt>
          <Txt v="h3" color={colors.primary}>
            {money(tournament.prize)}
          </Txt>
        </View>
        <View>
          <Txt v="tiny" color={colors.textMuted}>
            {t('entryFee')}
          </Txt>
          <Txt v="h3">{money(tournament.entryFee)}</Txt>
        </View>
        {reg ? <Badge label={t('registered')} /> : <View />}
      </Row>
    </Card>
  );
}
