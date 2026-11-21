import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { statusBadge } from '@/components/cards';
import { Bracket, FixtureRow, StandingsTable, teamDot } from '@/components/cup';
import { Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Badge, Button, Card, Chip, Divider, EmptyState, Field, HScroll, PitchArt, Row, Stat, Tap, Txt, useDir } from '@/components/ui';
import { WEB_URL } from '@/config';
import { dateFromOffset, formatDay } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { useCup } from '@/store/cups';
import { useEngagement } from '@/store/engagement';
import { colors, radius, shadow, space } from '@/theme';

type Tab = 'overview' | 'teams' | 'matches' | 'table' | 'stats' | 'clips';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, money, getPitch, registerTeam, errText, meId, signedIn } = useApp();
  const { tour, detail, loading, reload, isOrganizer, myTeam, teamName, playerName, scorers, live } = useCup(id);
  const { teams: myTeams } = useEngagement();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const d = useDir();
  const [tab, setTab] = useState<Tab>(tour && ['live', 'finished'].includes(tour.status) ? 'matches' : 'overview');
  const [sheet, setSheet] = useState(false);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeTeams = useMemo(() => (tour ? tour.teams.filter((tm) => tm.status !== 'rejected' && tm.status !== 'withdrawn') : []), [tour]);

  if (!tour) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="trophy-outline" title={t('noResults')} />
      </View>
    );
  }

  const pitch = getPitch(tour.pitchId);
  const full = activeTeams.length >= tour.maxTeams;
  const labels = { today: t('today'), tomorrow: t('tomorrow') };
  const approved = tour.teams.filter((tm) => tm.status === 'approved');
  const champion = detail.awards.find((a) => a.kind === 'champion');
  const fmt = tour.formatType ?? 'league';
  const groups = [...new Set(approved.map((tm) => tm.groupLabel).filter(Boolean))].sort() as string[];
  const myFixtures = myTeam ? tour.fixtures.filter((f) => (f.homeId === myTeam.id || f.awayId === myTeam.id) && f.status !== 'bye') : [];

  const register = async () => {
    setTried(true);
    if (name.trim().length < 2) return;
    setSaving(true);
    const r = await registerTeam(tour.id, name.trim());
    setSaving(false);
    if (!r.ok) return toast(errText(r.error), 'error');
    setSheet(false);
    toast(tour.entryFee > 0 ? t('registeredPendingToast') : t('registeredToast'), 'success');
    await reload();
  };

  const share = () =>
    Share.share({ message: `${l(tour.name)} 🏆\n${l(pitch.name)} · ${tour.format}×${tour.format}\n${t('prize')}: ${money(tour.prize)}\n${WEB_URL}/tournament/${tour.id}` }).catch(() => {});

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('overview') },
    { key: 'teams', label: t('teams') },
    { key: 'matches', label: t('fixtures') },
    { key: 'table', label: fmt === 'knockout' ? t('bracket') : t('standings') },
    { key: 'stats', label: t('scorers') },
    { key: 'clips', label: t('clips') },
  ];

  const info = (icon: React.ComponentProps<typeof Ionicons>['name'], text: string, onPress?: () => void) => (
    <Tap onPress={onPress} disabled={!onPress} scale={0.99}>
      <Row gap={10}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Txt v="body" style={{ flex: 1 }}>
          {text}
        </Txt>
        {onPress && <Ionicons name={d.forward} size={18} color={colors.textFaint} />}
      </Row>
    </Tap>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <ScreenHeader transparent light right={<Tap onPress={share} hitSlop={10}><Ionicons name="share-outline" size={22} color={colors.white} /></Tap>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false} refreshControl={live ? <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.white} /> : undefined}>
        <PitchArt tint={tour.tint} height={250 + insets.top} radiusSize={0}>
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, paddingBottom: space.xxl, gap: 6 }}>
            <Row gap={6}>
              {statusBadge(tour.status, t)}
              <Badge label={t(`fmt_${fmt}`)} color={colors.white} bg="rgba(255,255,255,0.18)" />
              {tour.ageCategory && tour.ageCategory !== 'open' && <Badge label={t(`age_${tour.ageCategory}` as never)} color={colors.white} bg="rgba(255,255,255,0.18)" />}
            </Row>
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
          {champion && (
            <Card style={{ backgroundColor: colors.warningSoft, gap: 4, alignItems: 'center' }}>
              <Ionicons name="trophy" size={30} color={colors.warning} />
              <Txt v="tiny" color={colors.textMuted}>{t('champion')}</Txt>
              <Txt v="h2">{teamName(champion.teamId)}</Txt>
            </Card>
          )}
          <Card>
            <Row>
              <Stat icon="trophy" value={money(tour.prize)} label={t('prize')} color={colors.warning} />
              <Stat icon="ticket" value={money(tour.entryFee)} label={t('entryFee')} />
              <Stat icon="shield" value={`${activeTeams.length}/${tour.maxTeams}`} label={t('teams')} color={colors.info} />
            </Row>
          </Card>

          {isOrganizer && (
            <Button title={t('manageTournament')} icon="settings-outline" kind="dark" onPress={() => router.push(`/tournament/manage/${tour.id}`)} />
          )}
          {tour.status === 'pending' && (
            <Card flat style={{ backgroundColor: colors.warningSoft }}>
              <Txt v="caption">{t('tournamentPendingHint')}</Txt>
            </Card>
          )}

          <View style={{ marginHorizontal: -space.lg }}>
            <HScroll gap={8}>
              {tabs.map((x) => (
                <Chip key={x.key} label={x.label} selected={tab === x.key} onPress={() => setTab(x.key)} />
              ))}
            </HScroll>
          </View>

          {tab === 'overview' && (
            <>
              <Card style={{ gap: space.md }}>
                {info('calendar-outline', tour.startOffset > 0 ? `${t('startsIn', { n: tour.startOffset })} · ${formatDay(dateFromOffset(tour.startOffset), lang, labels)}` : `${t('started')} · ${formatDay(dateFromOffset(tour.startOffset), lang, labels)}`)}
                {info('location-outline', `${l(pitch.name)} — ${l(pitch.area)}`, () => router.push(`/pitch/${pitch.id}`))}
                {info('people-outline', t('playersPerTeam', { min: tour.minPlayers ?? 5, max: tour.maxPlayers ?? 10 }))}
                {info('git-network-outline', fmt === 'groups' ? t('fmtGroupsLong', { n: tour.groupsCount ?? 2 }) : t(`fmt_${fmt}_long`))}
                {!!tour.prizeSecond && info('medal-outline', `${t('runnerUpPrize')}: ${money(tour.prizeSecond)}`)}
                {info('cash-outline', t('payAtPitchCup'))}
              </Card>
              {!!tour.rules && (
                <Card style={{ gap: space.sm }}>
                  <Txt v="h3">{t('rules')}</Txt>
                  <Txt v="body" color={colors.textMuted}>
                    {tour.rules}
                  </Txt>
                </Card>
              )}
              {myTeam && myFixtures.length > 0 && (
                <View style={{ gap: space.sm }}>
                  <Txt v="h3">{t('yourMatches')}</Txt>
                  {myFixtures.slice(0, 4).map((f) => (
                    <FixtureRow key={f.id} tour={tour} f={f} highlight={myTeam.id} compact />
                  ))}
                </View>
              )}
            </>
          )}

          {tab === 'teams' &&
            (activeTeams.length === 0 ? (
              <EmptyState icon="shield-outline" title={t('noTeamsYet')} />
            ) : (
              <Card style={{ paddingVertical: space.xs }}>
                {activeTeams.map((tm, i) => {
                  const n = detail.players.filter((p) => p.teamId === tm.id).length;
                  return (
                    <View key={tm.id}>
                      <Tap onPress={() => router.push(`/tournament/team/${tm.id}?t=${tour.id}`)} scale={0.99} style={{ paddingVertical: 12 }}>
                        <Row gap={space.md}>
                          {teamDot(tm.color, 14)}
                          <View style={{ flex: 1 }}>
                            <Txt v="bodyStrong">{l(tm.name)}</Txt>
                            <Txt v="tiny" color={colors.textMuted}>
                              {t('playersN', { n })}
                              {tm.groupLabel ? ` · ${t('groupX', { g: tm.groupLabel })}` : ''}
                            </Txt>
                          </View>
                          {tm.status === 'pending' && <Badge label={t('teamPending')} color={colors.warning} bg={colors.warningSoft} />}
                          {tm.id === myTeam?.id && <Badge label={t('yourTeam')} />}
                          <Ionicons name={d.forward} size={18} color={colors.textFaint} />
                        </Row>
                      </Tap>
                      {i < activeTeams.length - 1 && <Divider />}
                    </View>
                  );
                })}
              </Card>
            ))}

          {tab === 'matches' &&
            (tour.fixtures.filter((f) => f.status !== 'bye').length === 0 ? (
              <EmptyState icon="calendar-outline" title={t('fixtures')} body={t('noFixtures')} />
            ) : (
              <View style={{ gap: space.sm }}>
                {tour.fixtures
                  .filter((f) => f.status !== 'bye')
                  .map((f) => (
                    <FixtureRow key={f.id} tour={tour} f={f} highlight={myTeam?.id} />
                  ))}
              </View>
            ))}

          {tab === 'table' && (
            <View style={{ gap: space.md }}>
              {fmt === 'league' && <StandingsTable teams={approved} highlight={myTeam?.id} finished={tour.status === 'finished'} />}
              {fmt === 'groups' &&
                (groups.length === 0 ? (
                  <EmptyState icon="grid-outline" title={t('groupsAfterDraw')} />
                ) : (
                  groups.map((g) => (
                    <View key={g} style={{ gap: space.sm }}>
                      <Txt v="h3">{t('groupX', { g })}</Txt>
                      <StandingsTable teams={approved.filter((tm) => tm.groupLabel === g)} highlight={myTeam?.id} qualify={2} />
                    </View>
                  ))
                ))}
              {fmt !== 'league' &&
                (tour.fixtures.some((f) => f.stage === 'knockout') ? (
                  <View style={{ gap: space.sm }}>
                    {fmt === 'groups' && <Txt v="h3">{t('knockoutStage')}</Txt>}
                    <Bracket tour={tour} highlight={myTeam?.id} />
                  </View>
                ) : (
                  fmt === 'knockout' && <EmptyState icon="git-network-outline" title={t('bracketAfterDraw')} />
                ))}
            </View>
          )}

          {tab === 'stats' && (
            <View style={{ gap: space.md }}>
              {detail.awards.filter((a) => a.kind !== 'champion').length > 0 && (
                <Card style={{ gap: space.sm }}>
                  {detail.awards
                    .filter((a) => a.kind !== 'champion')
                    .map((a, i) => (
                      <Row key={i} gap={space.md}>
                        <Ionicons name={a.kind === 'runner_up' ? 'medal-outline' : a.kind === 'best_keeper' ? 'hand-left-outline' : a.kind === 'top_scorer' ? 'football' : 'star'} size={20} color={colors.warning} />
                        <Txt v="caption" color={colors.textMuted} style={{ width: 110 }}>
                          {t(`award_${a.kind}`)}
                        </Txt>
                        <Txt v="bodyStrong" style={{ flex: 1 }}>
                          {a.userId ? playerName(a.userId) : teamName(a.teamId)}
                          {a.value ? ` · ${a.value}` : ''}
                        </Txt>
                      </Row>
                    ))}
                </Card>
              )}
              {scorers().length === 0 ? (
                <EmptyState icon="football-outline" title={t('noGoalsYet')} />
              ) : (
                <Card style={{ paddingVertical: space.xs }}>
                  <Row style={{ paddingVertical: 8 }}>
                    <Txt v="tiny" color={colors.textMuted} style={{ flex: 1 }}>{t('player')}</Txt>
                    <Txt v="tiny" color={colors.textMuted} center style={{ width: 40 }}>⚽</Txt>
                    <Txt v="tiny" color={colors.textMuted} center style={{ width: 34 }}>🟨</Txt>
                    <Txt v="tiny" color={colors.textMuted} center style={{ width: 34 }}>🟥</Txt>
                  </Row>
                  <Divider />
                  {scorers().map((s, i) => (
                    <Row key={s.userId} style={{ paddingVertical: 10 }}>
                      <Txt v="label" style={{ width: 24 }}>{i + 1}</Txt>
                      <View style={{ flex: 1 }}>
                        <Txt v="bodyStrong">{playerName(s.userId)}</Txt>
                        <Txt v="tiny" color={colors.textMuted}>{teamName(s.teamId)}</Txt>
                      </View>
                      <Txt v="h3" center style={{ width: 40 }}>{s.goals}</Txt>
                      <Txt v="caption" center style={{ width: 34 }}>{s.yellow || '–'}</Txt>
                      <Txt v="caption" center style={{ width: 34 }}>{s.red || '–'}</Txt>
                    </Row>
                  ))}
                </Card>
              )}
            </View>
          )}

          {tab === 'clips' &&
            (detail.highlights.length === 0 ? (
              <EmptyState icon="videocam-outline" title={t('noClips')} body={t('noClipsSub')} />
            ) : (
              <View style={{ gap: space.sm }}>
                {detail.highlights.map((h) => {
                  const f = tour.fixtures.find((x) => x.id === h.fixtureId);
                  return (
                    <Card key={h.id} onPress={() => router.push(`/tournament/fixture/${h.fixtureId}`)}>
                      <Row gap={space.md}>
                        <View style={{ width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.inverse, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="play" size={24} color={colors.onInverse} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt v="bodyStrong">{h.playerId ? playerName(h.playerId) : t('goalClip')}</Txt>
                          <Txt v="tiny" color={colors.textMuted}>
                            {f ? `${teamName(f.homeId)} × ${teamName(f.awayId)}` : ''}
                          </Txt>
                        </View>
                        <Row gap={4}>
                          <Ionicons name="heart" size={14} color={colors.danger} />
                          <Txt v="tiny">{h.likes}</Txt>
                        </Row>
                      </Row>
                    </Card>
                  );
                })}
              </View>
            ))}
        </View>
      </ScrollView>

      {(tour.status === 'open' || myTeam) && signedIn && (
        <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: space.lg, paddingBottom: insets.bottom + space.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, gap: space.sm }, shadow]}>
          {myTeam ? (
            <Button title={t('myTeamX', { name: l(myTeam.name) })} kind="secondary" icon="shield-checkmark" onPress={() => router.push(`/tournament/team/${myTeam.id}?t=${tour.id}`)} />
          ) : (
            <Row gap={space.sm}>
              <Button title={full ? t('full') : t('registerTeam', { price: money(tour.entryFee) })} icon="shield" disabled={full} style={{ flex: 1 }} onPress={() => setSheet(true)} />
              <Button title={t('haveCode')} kind="ghost" icon="key-outline" onPress={() => router.push('/tournament/join')} />
            </Row>
          )}
        </View>
      )}

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={t('registerTitle')}>
        <View style={{ gap: space.lg }}>
          {myTeams.length > 0 && (
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('useTeam')}</Txt>
              <Row gap={8} wrap>
                {myTeams.map((tm) => (
                  <Chip key={tm.id} label={tm.name} icon="shirt-outline" selected={name === tm.name} onPress={() => setName(tm.name)} />
                ))}
              </Row>
            </View>
          )}
          <Field label={t('teamName')} placeholder={t('teamNamePlaceholder')} value={name} onChangeText={setName} autoFocus error={tried && name.trim().length < 2 ? t('required') : undefined} onSubmitEditing={register} />
          <Card flat style={{ backgroundColor: colors.primarySoft, gap: 4 }}>
            <Txt v="caption">{t('captainHint', { min: tour.minPlayers ?? 5, max: tour.maxPlayers ?? 10 })}</Txt>
            {tour.entryFee > 0 && <Txt v="caption">{t('payAtPitchCupFee', { fee: money(tour.entryFee) })}</Txt>}
          </Card>
          <Button title={t('confirm')} icon="checkmark-circle" loading={saving} onPress={register} />
        </View>
      </Sheet>
    </View>
  );
}
