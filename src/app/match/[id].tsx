import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking as RNLinking, ScrollView, Share, Switch, View } from 'react-native';
import { WEB_URL } from '@/config';
import { sideLevel, sidesFor } from '@/lib/teams';
import { matchPhase, matchTimes, splitDuration } from '@/lib/matchPhase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LevelBadge } from '@/components/cards';
import { Stepper } from '@/components/academy';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { useEngagement } from '@/store/engagement';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Badge, Button, Card, Chip, EmptyState, HScroll, IconButton, PitchArt, Progress, Row, Tap, Txt, useDir } from '@/components/ui';
import { dateFromOffset, formatDay, formatDuration, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import { colors, radius, shadow, space } from '@/theme';

export default function MatchScreen() {
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string }>();
  const { t, l, lang, money, getMatch, getPitch, getPlayer, matchPlayers, isJoined, joinMatch, leaveMatch, errText, meId, matchCode, setMatchPrivate, inviteTeamToMatch, balanceTeams, setPlayerTeams, switchMyTeam } = useApp();
  const [code, setCode] = useState<string | undefined>();
  const [inviteOpen, setInviteOpen] = useState(invite === '1');
  const [moving, setMoving] = useState<string | null>(null);
  const [balancing, setBalancing] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const d = useDir();
  const [leaving, setLeaving] = useState(false);
  const match = getMatch(id);
  const eng = useEngagement();
  const [resultOpen, setResultOpen] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [noShows, setNoShows] = useState<string[]>([]);
  // Re-render every 30 s so the countdown and the live / finished state stay current.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);
  const canInvite = !!match && (match.organizerId === meId || isJoined(match.id));
  useEffect(() => {
    if (!match || !canInvite || code) return;
    if (match.inviteCode) return setCode(match.inviteCode);
    matchCode(match.id).then((r) => r.ok && r.id && setCode(r.id));
  }, [match?.id, match?.inviteCode, canInvite]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const phase = matchPhase(match, now);
  const { start, end } = matchTimes(match);
  const isPast = phase === 'ended';
  const upcoming = phase === 'upcoming';
  const span = (ms: number) => {
    const { d, h, m } = splitDuration(ms);
    if (lang === 'ar') return [d && `${d} يوم`, h && `${h} ساعة`, (m || (!d && !h)) && `${m} دقيقة`].filter(Boolean).join(' و ');
    return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(' ');
  };
  const result = eng.getResult(match.id);
  const mvp = eng.mvpOf(match.id);
  const myVote = result?.votes[meId];
  const waitlist = eng.waitlistFor(match.id);
  const myWaitPos = waitlist.indexOf(meId) + 1;
  const half = Math.ceil(match.maxPlayers / 2);
  const { teamA, teamB, assigned } = sidesFor(ids, match.teams, match.maxPlayers);
  const isOrganizer = match.organizerId === meId;
  const { teams: myTeams } = eng;
  const organizer = getPlayer(match.organizerId);
  const date = dateFromOffset(match.dayOffset);
  const when = `${formatDay(date, lang, { today: t('today'), tomorrow: t('tomorrow') })} · ${formatHour(match.hour, lang)} – ${formatHour(match.hour + match.duration, lang)}`;

  const link = code ? `${WEB_URL}/match/join?code=${code}` : `${WEB_URL}/match/${match.id}`;
  const shareText = [
    `${t('appName')} ⚽ ${l(pitch.name)}`,
    when,
    `${match.format}×${match.format} · ${money(match.pricePerPlayer)} ${t('perPlayer')}`,
    left > 0 ? t('spotsLeft', { n: left }) : t('full'),
    code ? t('inviteCodeLine', { code }) : '',
    link,
  ].filter(Boolean).join('\n');
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
      <Tap onPress={() => (upcoming && (isOrganizer || (isMe && joined)) ? setMoving(pid) : !isMe && router.push(`/player/${pid}`))} style={{ alignItems: 'center', gap: 4, width: 64 }}>
        <View>
          <Avatar name={l(p.name)} color={isMe ? colors.accentDark : p.color} uri={p.avatarUrl} size={44} ring />
          <View style={{ position: 'absolute', bottom: -4, alignSelf: 'center', backgroundColor: '#0D1B33', borderRadius: 6, paddingHorizontal: 4 }}>
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
      <ScreenHeader title={t('gameDetails')} right={<IconButton icon="share-social-outline" label="share" onPress={() => (canInvite ? setInviteOpen(true) : share())} />} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: space.md }}>
          <Row gap={6}>
            <Badge label={`${match.format}×${match.format}`} icon="football-outline" />
            <LevelBadge level={match.level} />
            {joined && <Badge label={t('joined')} icon="checkmark-circle" />}
            {match.isPrivate && <Badge label={t('privateGame')} icon="lock-closed" color={colors.warning} bg={colors.warningSoft} />}
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

        {/* Game status: countdown → live → full time */}
        <Card
          flat
          style={{
            gap: 8,
            backgroundColor: phase === 'live' ? colors.successSoft : phase === 'ended' ? colors.surfaceMuted : colors.primarySoft,
          }}
        >
          <Row gap={10}>
            <Ionicons
              name={phase === 'live' ? 'radio-button-on' : phase === 'ended' ? 'flag' : 'time-outline'}
              size={22}
              color={phase === 'live' ? colors.success : phase === 'ended' ? colors.textMuted : colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong" color={phase === 'live' ? colors.success : phase === 'ended' ? colors.text : colors.primary}>
                {phase === 'upcoming' ? t('kickoffIn', { time: span(start - now) }) : phase === 'live' ? t('liveNowLong') : t('gameEndedLong')}
              </Txt>
              <Txt v="caption" color={colors.textMuted}>
                {phase === 'upcoming'
                  ? t(joined ? 'statusUpcomingJoined' : 'statusUpcoming')
                  : phase === 'live'
                    ? t('timeLeft', { time: span(end - now) })
                    : result
                      ? t('resultRecorded')
                      : isOrganizer
                        ? t('recordResultPrompt')
                        : t('awaitingResult')}
              </Txt>
            </View>
          </Row>
          {phase === 'live' && <Progress value={(now - start) / (end - start)} height={6} color={colors.success} />}
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

        {/* Organiser: split the sides */}
        {isOrganizer && upcoming && (
          <Card style={{ gap: space.md }}>
            <Row gap={space.sm}>
              <Ionicons name="git-compare-outline" size={20} color={colors.primary} />
              <Txt v="h3" style={{ flex: 1 }}>{t('teamTools')}</Txt>
              {assigned && (
                <Txt v="tiny" color={colors.textMuted}>
                  {t('levelVs', { a: sideLevel(teamA, getPlayer).toFixed(1), b: sideLevel(teamB, getPlayer).toFixed(1) })}
                </Txt>
              )}
            </Row>
            <Txt v="caption" color={colors.textMuted}>{t('teamToolsHint')}</Txt>
            <Row gap={space.sm}>
              <Button
                title={t('balanceTeams')}
                icon="sparkles"
                small
                loading={balancing}
                disabled={ids.length < 2}
                style={{ flex: 1 }}
                onPress={async () => {
                  setBalancing(true);
                  const r = await balanceTeams(match.id, false);
                  setBalancing(false);
                  toast(r.ok ? t('teamsBalanced') : errText(r.error), r.ok ? 'success' : 'error');
                }}
              />
              {assigned && (
                <Button
                  title={t('reshuffle')}
                  icon="shuffle"
                  kind="secondary"
                  small
                  disabled={balancing}
                  style={{ flex: 1 }}
                  onPress={async () => {
                    setBalancing(true);
                    const r = await balanceTeams(match.id, true);
                    setBalancing(false);
                    toast(r.ok ? t('teamsReshuffled') : errText(r.error), r.ok ? 'success' : 'error');
                  }}
                />
              )}
            </Row>
          </Card>
        )}

        {/* Invite friends */}
        {canInvite && upcoming && (
          <Card style={{ gap: space.md }} onPress={() => setInviteOpen(true)}>
            <Row gap={space.sm}>
              <Ionicons name="people" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{t('inviteFriends')}</Txt>
                <Txt v="caption" color={colors.textMuted}>{t('inviteFriendsSub', { price: money(match.pricePerPlayer) })}</Txt>
              </View>
              {!!code && (
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Txt v="bodyStrong" color={colors.primary} style={{ letterSpacing: 2 }}>{code}</Txt>
                </View>
              )}
            </Row>
          </Card>
        )}

        {/* Result, MVP vote */}
        {isPast && (
          <Card style={{ gap: space.md }}>
            <Row justify="space-between">
              <Txt v="h2">{t('result')}</Txt>
              {match.organizerId === meId && (
                <Button
                  title={t('recordResult')}
                  small
                  kind={result ? 'ghost' : 'primary'}
                  icon="create-outline"
                  onPress={() => {
                    setScoreA(result?.scoreA ?? 0);
                    setScoreB(result?.scoreB ?? 0);
                    setNoShows(result?.noShows ?? []);
                    setResultOpen(true);
                  }}
                />
              )}
            </Row>
            {result ? (
              <>
                <Row justify="center" gap={space.xl}>
                  <View style={{ alignItems: 'center' }}>
                    <Txt v="tiny" color={colors.textMuted}>{t('teamA')}</Txt>
                    <Txt v="display" color={colors.primary}>{result.scoreA}</Txt>
                  </View>
                  <Txt v="h2" color={colors.textFaint}>-</Txt>
                  <View style={{ alignItems: 'center' }}>
                    <Txt v="tiny" color={colors.textMuted}>{t('teamB')}</Txt>
                    <Txt v="display" color={colors.primary}>{result.scoreB}</Txt>
                  </View>
                </Row>
                {mvp && (
                  <Row gap={space.sm} justify="center" style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.sm }}>
                    <Ionicons name="trophy" size={18} color={colors.warning} />
                    <Txt v="bodyStrong">{t('mvpBadge')}: {mvp === meId ? t('you') : l(getPlayer(mvp).name)}</Txt>
                  </Row>
                )}
                {joined && (
                  <View style={{ gap: space.sm }}>
                    <Txt v="label" color={colors.textMuted}>
                      {myVote ? `${t('yourVote')}: ${l(getPlayer(myVote).name)}` : t('voteMvp')}
                    </Txt>
                    <HScroll gap={8} padding={0}>
                      {ids.filter((pid) => pid !== meId).map((pid) => (
                        <Chip
                          key={pid}
                          label={l(getPlayer(pid).name).split(' ')[0]}
                          selected={myVote === pid}
                          onPress={async () => {
                            const r = await eng.voteMvp(match.id, pid);
                            toast(r.ok ? t('voteSaved') : errText(r.error), r.ok ? 'success' : 'error');
                          }}
                        />
                      ))}
                    </HScroll>
                  </View>
                )}
              </>
            ) : (
              <Txt v="caption" color={colors.textMuted}>
                {t('awaitingResult')}
              </Txt>
            )}
          </Card>
        )}

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

      {upcoming && (
      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, padding: space.lg, paddingBottom: insets.bottom + space.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }, shadow]}>
        {!joined && left <= 0 ? (
          myWaitPos > 0 ? (
            <Row gap={space.sm}>
              <View style={{ flex: 1.4, justifyContent: 'center' }}>
                <Txt v="bodyStrong">{t('waitlistPosition', { n: myWaitPos })}</Txt>
              </View>
              <Button title={t('leaveWaitlist')} kind="ghost" small onPress={() => eng.leaveWaitlist(match.id)} style={{ flex: 1 }} />
            </Row>
          ) : (
            <View style={{ gap: 6 }}>
              <Button
                title={t('joinWaitlist')}
                icon="hourglass-outline"
                kind="secondary"
                onPress={async () => {
                  const r = await eng.joinWaitlist(match.id);
                  toast(r.ok ? t('waitlistJoined') : errText(r.error), r.ok ? 'info' : 'error');
                }}
              />
              {waitlist.length > 0 && (
                <Txt v="tiny" color={colors.textMuted} center>
                  {t('waitlistCount', { n: waitlist.length })}
                </Txt>
              )}
            </View>
          )
        ) : joined ? (
          <Row gap={space.sm}>
            <Button title={t('inviteFriends')} icon="person-add" onPress={() => setInviteOpen(true)} style={{ flex: 1.4 }} />
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
      )}

      <Sheet visible={resultOpen} onClose={() => setResultOpen(false)} title={t('recordResult')}>
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: space.lg }}>
          <Row gap={space.md}>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('teamA')}</Txt>
              <Stepper value={scoreA} onChange={setScoreA} min={0} max={99} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('teamB')}</Txt>
              <Stepper value={scoreB} onChange={setScoreB} min={0} max={99} />
            </View>
          </Row>
          <View style={{ gap: space.sm }}>
            <Txt v="label" color={colors.textMuted}>{t('noShowsLabel')}</Txt>
            {ids.filter((pid) => pid !== meId).map((pid) => {
              const absent = noShows.includes(pid);
              return (
                <Row key={pid} justify="space-between">
                  <Txt v="bodyStrong">{l(getPlayer(pid).name)}</Txt>
                  <Chip
                    label={absent ? t('noShow') : t('attended')}
                    icon={absent ? 'close-circle-outline' : 'checkmark-circle-outline'}
                    selected={absent}
                    onPress={() => setNoShows(absent ? noShows.filter((x) => x !== pid) : [...noShows, pid])}
                  />
                </Row>
              );
            })}
          </View>
          <Button
            title={t('save')}
            icon="checkmark-circle"
            onPress={async () => {
              const r = await eng.recordResult(match.id, scoreA, scoreB, noShows);
              if (!r.ok) return toast(errText(r.error), 'error');
              setResultOpen(false);
              toast(t('resultSaved'));
            }}
          />
        </ScrollView>
      </Sheet>

      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title={t('inviteFriends')}>
        <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space.lg }}>
          <View style={{ alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg }}>
            <Txt v="tiny" color={colors.textMuted}>{t('gameCode')}</Txt>
            <Txt v="display" color={colors.primary} style={{ letterSpacing: 6 }}>{code ?? '······'}</Txt>
            <Txt v="caption" color={colors.textMuted} center>{t('inviteCodeHint')}</Txt>
          </View>
          <Row justify="space-between" style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: space.md }}>
            <Txt v="bodyStrong">{t('perPlayerShare')}</Txt>
            <Txt v="h3" color={colors.primary}>{money(match.pricePerPlayer)}</Txt>
          </Row>
          <Row gap={space.sm}>
            <Button title={t('shareWhatsapp')} icon="logo-whatsapp" onPress={shareWhatsapp} style={{ flex: 1 }} />
            <Button title={t('share')} icon="share-outline" kind="secondary" onPress={share} style={{ flex: 1 }} />
          </Row>
          {isOrganizer && (
            <Row gap={space.md} justify="space-between">
              <View style={{ flex: 1 }}>
                <Row gap={6}>
                  <Ionicons name={match.isPrivate ? 'lock-closed' : 'earth'} size={16} color={colors.primary} />
                  <Txt v="bodyStrong">{t('privateGame')}</Txt>
                </Row>
                <Txt v="caption" color={colors.textMuted}>{t(match.isPrivate ? 'privateOnHint' : 'privateOffHint')}</Txt>
              </View>
              <Switch
                value={!!match.isPrivate}
                trackColor={{ true: colors.primary, false: colors.border }}
                onValueChange={async (v) => {
                  const r = await setMatchPrivate(match.id, v);
                  if (!r.ok) toast(errText(r.error), 'error');
                }}
              />
            </Row>
          )}
          {isOrganizer && myTeams.length > 0 && (
            <View style={{ gap: space.sm }}>
              <Txt v="label" color={colors.textMuted}>{t('inviteFixedTeam')}</Txt>
              <Row gap={8} wrap>
                {myTeams.map((tm) => (
                  <Chip
                    key={tm.id}
                    label={tm.name}
                    icon="shield-outline"
                    onPress={async () => {
                      const r = await inviteTeamToMatch(match.id, tm.id);
                      toast(r.ok ? t('teamInvitedN', { n: Number(r.id ?? 0) }) : errText(r.error), r.ok ? 'success' : 'error');
                    }}
                  />
                ))}
              </Row>
            </View>
          )}
        </ScrollView>
      </Sheet>

      <Sheet visible={!!moving} onClose={() => setMoving(null)} title={moving ? (moving === meId ? t('you') : l(getPlayer(moving).name)) : undefined}>
        {moving && !isOrganizer && moving === meId && (
          <View style={{ gap: space.sm }}>
            <Txt v="caption" color={colors.textMuted}>{t('switchSideHint')}</Txt>
            <Button
              title={t(teamA.includes(meId) ? 'switchToB' : 'switchToA')}
              icon="swap-horizontal"
              onPress={async () => {
                setMoving(null);
                const r = await switchMyTeam(match.id, { teamA, teamB });
                toast(r.ok ? t('switchedSide') : errText(r.error), r.ok ? 'success' : 'error');
              }}
            />
          </View>
        )}
        {moving && isOrganizer && (
          <View style={{ gap: space.sm }}>
            <Txt v="caption" color={colors.textMuted}>{t('movePlayerHint')}</Txt>
            <Row gap={space.sm}>
              {(['A', 'B'] as const).map((side) => {
                const current = (side === 'A' ? teamA : teamB).includes(moving);
                return (
                  <Button
                    key={side}
                    title={side === 'A' ? t('teamA') : t('teamB')}
                    kind={current ? 'primary' : 'secondary'}
                    icon={current ? 'checkmark-circle' : 'swap-horizontal'}
                    style={{ flex: 1 }}
                    onPress={async () => {
                      const who = moving;
                      setMoving(null);
                      if (current && assigned) return;
                      // Lock everyone's current side first so only this player moves.
                      const sides: Record<string, 'A' | 'B'> = { [who]: side };
                      if (!assigned) for (const pid of ids) if (pid !== who) sides[pid] = teamA.includes(pid) ? 'A' : 'B';
                      const r = await setPlayerTeams(match.id, sides);
                      toast(r.ok ? t('playerMoved') : errText(r.error), r.ok ? 'success' : 'error');
                    }}
                  />
                );
              })}
            </Row>
            {moving !== meId && (
              <Button
                title={t('viewProfile')}
                kind="ghost"
                icon="person-outline"
                onPress={() => {
                  const who = moving;
                  setMoving(null);
                  router.push(`/player/${who}`);
                }}
              />
            )}
          </View>
        )}
      </Sheet>

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
