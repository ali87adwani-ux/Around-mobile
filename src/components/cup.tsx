/** Shared tournament pieces: fixture row, standings table, knockout bracket. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import type { Fixture, TeamRow, Tournament } from '@/data/types';
import { dateFromOffset, formatDay, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { rankTeams, roundKey } from '@/store/cups';
import { colors, radius, space } from '@/theme';
import { Card, Divider, Row, Txt, useDir } from './ui';

/** Demo fixtures carry no status / timestamp, so fall back to the score and day offset. */
export const isPlayed = (f: Fixture) => (f.status ? f.status === 'played' || f.status === 'walkover' : !!f.score);
export const hasTime = (f: Fixture) => !!f.startsAt || f.dayOffset < 9999;

export function teamDot(color?: string, size = 10) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.border }} />;
}

export function FixtureRow({ tour, f, highlight, compact }: { tour: Tournament; f: Fixture; highlight?: string; compact?: boolean }) {
  const { t, l, lang } = useApp();
  const d = useDir();
  const team = (id?: string) => tour.teams.find((x) => x.id === id);
  const h = team(f.homeId);
  const a = team(f.awayId);
  const played = isPlayed(f);
  const labels = { today: t('today'), tomorrow: t('tomorrow') };
  const when = hasTime(f) ? `${formatDay(dateFromOffset(f.dayOffset), lang, labels)} · ${formatHour(f.hour, lang)}` : t('notScheduled');
  const score = played && f.score ? (d.isRTL ? `${f.score[1]} - ${f.score[0]}` : `${f.score[0]} - ${f.score[1]}`) : t('vs');
  const mine = highlight && (f.homeId === highlight || f.awayId === highlight);
  return (
    <Card onPress={() => router.push(`/tournament/fixture/${f.id}`)} style={{ gap: space.sm, padding: compact ? space.md : space.lg, borderWidth: mine ? 1.5 : 0, borderColor: colors.primary }}>
      <Row justify="space-between">
        <Txt v="tiny" color={colors.textMuted}>
          {when}
        </Txt>
        <Txt v="tiny" color={f.status === 'walkover' ? colors.warning : colors.textFaint}>
          {f.status === 'walkover' ? t('walkover') : f.groupLabel ? t('groupX', { g: f.groupLabel }) : ''}
        </Txt>
      </Row>
      <Row gap={space.md}>
        <Row gap={8} style={{ flex: 1 }}>
          {teamDot(h?.color, 12)}
          <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }} color={h ? colors.text : colors.textFaint}>
            {h ? l(h.name) : t('tbd')}
          </Txt>
        </Row>
        <View style={{ minWidth: 64, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: played ? colors.inverse : colors.primarySoft }}>
          <Txt v="h3" center color={played ? colors.onInverse : colors.primary}>
            {score}
          </Txt>
        </View>
        <Row gap={8} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }} color={a ? colors.text : colors.textFaint}>
            {a ? l(a.name) : t('tbd')}
          </Txt>
          {teamDot(a?.color, 12)}
        </Row>
      </Row>
      {f.pens && (
        <Txt v="tiny" color={colors.textMuted} center>
          {t('pensShort', { h: f.pens[0], a: f.pens[1] })}
        </Txt>
      )}
    </Card>
  );
}

export function StandingsTable({ teams, highlight, finished, qualify = 0 }: { teams: TeamRow[]; highlight?: string; finished?: boolean; qualify?: number }) {
  const { t, l } = useApp();
  const table = rankTeams(teams);
  const Cell = ({ children, w = 30, strong }: { children: React.ReactNode; w?: number; strong?: boolean }) => (
    <Txt v={strong ? 'label' : 'caption'} center style={{ width: w }} color={strong ? colors.text : colors.textMuted}>
      {children}
    </Txt>
  );
  return (
    <Card style={{ paddingHorizontal: space.md }}>
      <Row style={{ paddingBottom: space.sm }}>
        <Cell w={24}>#</Cell>
        <Txt v="tiny" color={colors.textMuted} style={{ flex: 1 }}>
          {t('teams')}
        </Txt>
        <Cell>{t('pl')}</Cell>
        <Cell>{t('w')}</Cell>
        <Cell>{t('d')}</Cell>
        <Cell>{t('l')}</Cell>
        <Cell w={38}>{t('gd')}</Cell>
        <Cell w={36} strong>
          {t('pts')}
        </Cell>
      </Row>
      <Divider />
      {table.map((r, i) => (
        <View key={r.id}>
          <Row style={{ paddingVertical: 11, backgroundColor: r.id === highlight ? colors.primarySoft : undefined, borderRadius: radius.sm }}>
            <View style={{ width: 24, alignItems: 'center' }}>
              {finished && i === 0 ? <Ionicons name="trophy" size={15} color={colors.warning} /> : <Txt v="label" center color={i < qualify ? colors.success : colors.text}>{i + 1}</Txt>}
            </View>
            <Row gap={8} style={{ flex: 1 }}>
              {teamDot(r.color)}
              <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {l(r.name)}
              </Txt>
            </Row>
            <Cell>{r.played}</Cell>
            <Cell>{r.won}</Cell>
            <Cell>{r.drawn}</Cell>
            <Cell>{r.lost}</Cell>
            <Cell w={38}>{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</Cell>
            <Cell w={36} strong>
              {r.won * 3 + r.drawn}
            </Cell>
          </Row>
          {i < table.length - 1 && <Divider />}
        </View>
      ))}
    </Card>
  );
}

/** Knockout rounds side by side (scrolls sideways). */
export function Bracket({ tour, highlight }: { tour: Tournament; highlight?: string }) {
  const { t, l } = useApp();
  const ko = tour.fixtures.filter((f) => f.stage === 'knockout');
  const rounds = [...new Set(ko.map((f) => f.roundNo ?? 1))].sort((a, b) => a - b);
  if (!rounds.length) return null;
  const team = (id?: string) => tour.teams.find((x) => x.id === id);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingVertical: space.xs }}>
      {rounds.map((r) => {
        const list = ko.filter((f) => f.roundNo === r).sort((a, b) => (a.bracketPos ?? 0) - (b.bracketPos ?? 0));
        return (
          <View key={r} style={{ width: 190, gap: space.sm, justifyContent: 'space-around' }}>
            <Txt v="label" color={colors.textMuted} center>
              {t(`round_${roundKey(list.length)}`)}
            </Txt>
            {list.map((f) => {
              const played = isPlayed(f);
              const homeWin = played && f.score && (f.score[0] > f.score[1] || (f.score[0] === f.score[1] && (f.pens?.[0] ?? 0) > (f.pens?.[1] ?? 0)));
              const side = (id: string | undefined, win: boolean, goals?: number) => {
                const tm = team(id);
                return (
                  <Row gap={6} style={{ paddingVertical: 6, paddingHorizontal: 8, backgroundColor: id && id === highlight ? colors.primarySoft : undefined, borderRadius: radius.sm }}>
                    {teamDot(tm?.color, 8)}
                    <Txt v={win ? 'label' : 'caption'} numberOfLines={1} style={{ flex: 1 }} color={tm ? colors.text : colors.textFaint}>
                      {tm ? l(tm.name) : f.status === 'bye' ? t('bye') : t('tbd')}
                    </Txt>
                    {played && <Txt v="label">{goals}</Txt>}
                  </Row>
                );
              };
              return (
                <Card key={f.id} flat onPress={() => router.push(`/tournament/fixture/${f.id}`)} style={{ padding: 4, borderWidth: 1, borderColor: colors.border, opacity: f.status === 'bye' ? 0.6 : 1 }}>
                  {side(f.homeId, !!homeWin, f.score?.[0])}
                  <Divider />
                  {side(f.awayId, played && !homeWin, f.score?.[1])}
                </Card>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function cupStatusLabel(status: Tournament['status'], t: ReturnType<typeof useApp>['t']) {
  return t(`status_${status}`);
}
