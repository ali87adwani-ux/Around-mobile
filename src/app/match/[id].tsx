import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import * as Linking from 'expo-linking';
import { Linking as RNLinking, ScrollView, Share, View } from 'react-native';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, money, getMatch, getPitch, getPlayer, matchPlayers, isJoined, joinMatch, leaveMatch, errText, meId } = useApp();
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
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const isPast = match.dayOffset < 0 || (match.dayOffset === 0 && match.hour + match.duration <= nowH);
  const result = eng.getResult(match.id);
  const mvp = eng.mvpOf(match.id);
  const myVote = result?.votes[meId];
  const waitlist = eng.waitlistFor(match.id);
  const myWaitPos = waitlist.indexOf(meId) + 1;
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

      {!isPast && (
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
