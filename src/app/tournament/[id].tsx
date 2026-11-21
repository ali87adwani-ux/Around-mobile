import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { statusBadge } from '@/components/cards';
import { Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, Divider, EmptyState, Field, PitchArt, Row, Segmented, Stat, Tap, Txt, useDir } from '@/components/ui';
import type { TeamRow } from '@/data/types';
import { dateFromOffset, formatDay, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, radius, shadow, space } from '@/theme';

const pts = (r: TeamRow) => r.won * 3 + r.drawn;

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, money, getTournament, getPitch, state, dispatch } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const d = useDir();
  const tour = getTournament(id);
  const [tab, setTab] = useState<'overview' | 'standings' | 'fixtures'>(tour?.status === 'open' ? 'overview' : 'standings');
  const [sheet, setSheet] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [tried, setTried] = useState(false);

  if (!tour) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="trophy-outline" title={t('noResults')} />
      </View>
    );
  }

  const reg = state.registrations[tour.id];
  const pitch = getPitch(tour.pitchId);
  const myTeam: TeamRow | null = reg ? { id: 'mine', name: { ar: reg, en: reg }, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, color: colors.accentDark } : null;
  const teams = [...tour.teams, ...(myTeam ? [myTeam] : [])];
  const table = [...teams].sort((a, b) => pts(b) - pts(a) || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
  const teamById = (tid: string) => teams.find((x) => x.id === tid)!;
  const full = teams.length >= tour.maxTeams;
  const labels = { today: t('today'), tomorrow: t('tomorrow') };

  const register = () => {
    setTried(true);
    if (!teamName.trim()) return;
    dispatch({ type: 'register', tournamentId: tour.id, teamName: teamName.trim() });
    setSheet(false);
    toast(t('registeredToast'));
  };

  const Cell = ({ children, w = 34, strong }: { children: React.ReactNode; w?: number; strong?: boolean }) => (
    <Txt v={strong ? 'label' : 'caption'} center style={{ width: w }} color={strong ? colors.text : colors.textMuted}>
      {children}
    </Txt>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <ScreenHeader transparent light />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <PitchArt tint={tour.tint} height={250 + insets.top} radiusSize={0}>
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, paddingBottom: space.xxl, gap: 6 }}>
            {statusBadge(tour.status, t)}
            <Txt v="display" color={colors.white}>
              {l(tour.name)}
            </Txt>
            <Row gap={6}>
              <Ionicons name="location" size={14} color={colors.accent} />
              <Txt v="caption" color="rgba(255,255,255,0.85)">
                {l(pitch.name)} · {`${tour.format}×${tour.format}`}
              </Txt>
            </Row>
          </View>
        </PitchArt>

        <View style={{ marginTop: -space.xl, padding: space.lg, gap: space.lg }}>
          <Card>
            <Row>
              <Stat icon="trophy" value={money(tour.prize)} label={t('prize')} color={colors.warning} />
              <Stat icon="ticket" value={money(tour.entryFee)} label={t('entryFee')} />
              <Stat icon="shield" value={`${teams.length}/${tour.maxTeams}`} label={t('teams')} color={colors.info} />
            </Row>
          </Card>

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: t('overview') },
              { value: 'standings', label: t('standings') },
              { value: 'fixtures', label: t('fixtures') },
            ]}
          />

          {tab === 'overview' && (
            <Card style={{ gap: space.md }}>
              <Row gap={10}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Txt v="body">
                  {tour.startOffset > 0 ? t('startsIn', { n: tour.startOffset }) : `${t('started')} · ${formatDay(dateFromOffset(tour.startOffset), lang, labels)}`}
                </Txt>
              </Row>
              <Tap onPress={() => router.push(`/pitch/${pitch.id}`)} scale={0.99}>
                <Row gap={10}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                  <Txt v="body" style={{ flex: 1 }}>
                    {l(pitch.name)} — {l(pitch.area)}
                  </Txt>
                  <Ionicons name={d.forward} size={18} color={colors.textFaint} />
                </Row>
              </Tap>
              <Divider />
              <Txt v="h3">{t('teams')}</Txt>
              <Row gap={8} wrap>
                {teams.map((tm) => (
                  <Row key={tm.id} gap={6} style={{ backgroundColor: tm.id === 'mine' ? colors.primarySoft : colors.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tm.color }} />
                    <Txt v="caption">{l(tm.name)}</Txt>
                  </Row>
                ))}
              </Row>
            </Card>
          )}

          {tab === 'standings' && (
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
                <Cell w={40}>{t('gd')}</Cell>
                <Cell w={40} strong>
                  {t('pts')}
                </Cell>
              </Row>
              <Divider />
              {table.map((r, i) => (
                <View key={r.id}>
                  <Row style={{ paddingVertical: 12, backgroundColor: r.id === 'mine' ? colors.primarySoft : undefined, borderRadius: radius.sm }}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      {tour.status === 'finished' && i === 0 ? <Ionicons name="trophy" size={15} color={colors.warning} /> : <Txt v="label" center>{i + 1}</Txt>}
                    </View>
                    <Row gap={8} style={{ flex: 1 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} />
                      <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {l(r.name)}
                      </Txt>
                    </Row>
                    <Cell>{r.played}</Cell>
                    <Cell>{r.won}</Cell>
                    <Cell>{r.drawn}</Cell>
                    <Cell>{r.lost}</Cell>
                    <Cell w={40}>{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</Cell>
                    <Cell w={40} strong>
                      {pts(r)}
                    </Cell>
                  </Row>
                  {i < table.length - 1 && <Divider />}
                </View>
              ))}
            </Card>
          )}

          {tab === 'fixtures' &&
            (tour.fixtures.length === 0 ? (
              <EmptyState icon="calendar-outline" title={t('fixtures')} body={t('noFixtures')} />
            ) : (
              <View style={{ gap: space.sm }}>
                {tour.fixtures.map((f) => {
                  const h = teamById(f.homeId);
                  const a = teamById(f.awayId);
                  return (
                    <Card key={f.id} style={{ gap: space.sm }}>
                      <Txt v="tiny" color={colors.textMuted} center>
                        {formatDay(dateFromOffset(f.dayOffset), lang, labels)} · {formatHour(f.hour, lang)}
                      </Txt>
                      <Row gap={space.md}>
                        <Row gap={8} style={{ flex: 1 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: h.color }} />
                          <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {l(h.name)}
                          </Txt>
                        </Row>
                        <View style={{ minWidth: 64, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: f.score ? colors.text : colors.primarySoft }}>
                          <Txt v="h3" center color={f.score ? colors.white : colors.primary}>
                            {f.score ? (d.isRTL ? `${f.score[1]} - ${f.score[0]}` : `${f.score[0]} - ${f.score[1]}`) : t('vs')}
                          </Txt>
                        </View>
                        <Row gap={8} style={{ flex: 1, justifyContent: 'flex-end' }}>
                          <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {l(a.name)}
                          </Txt>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: a.color }} />
                        </Row>
                      </Row>
                    </Card>
                  );
                })}
              </View>
            ))}
        </View>
      </ScrollView>

      {tour.status === 'open' && (
        <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: space.lg, paddingBottom: insets.bottom + space.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }, shadow]}>
          {reg ? (
            <Button title={t('registered')} kind="secondary" icon="shield-checkmark" disabled />
          ) : (
            <Button title={full ? t('full') : t('registerTeam', { price: money(tour.entryFee) })} icon="shield" disabled={full} onPress={() => setSheet(true)} />
          )}
        </View>
      )}

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={t('registerTitle')}>
        <View style={{ gap: space.lg }}>
          <Field label={t('teamName')} placeholder={t('teamNamePlaceholder')} value={teamName} onChangeText={setTeamName} autoFocus error={tried && !teamName.trim() ? t('required') : undefined} onSubmitEditing={register} />
          <Row justify="space-between">
            <Txt v="h3">{t('entryFee')}</Txt>
            <Txt v="h2" color={colors.primary}>
              {money(tour.entryFee)}
            </Txt>
          </Row>
          <Button title={t('confirm')} icon="checkmark-circle" onPress={register} />
        </View>
      </Sheet>
    </View>
  );
}
