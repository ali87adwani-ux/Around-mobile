/** One tournament match: score, scorers and cards, MVP, clips. Organisers record the result and upload clips here. */
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stepper } from '@/components/academy';
import { ClipPlayer } from '@/components/ClipPlayer';
import { hasTime, isPlayed, teamDot } from '@/components/cup';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, Chip, Divider, EmptyState, Row, Tap, Txt, webNoOutline } from '@/components/ui';
import type { MatchEvent } from '@/data/types';
import { dateFromOffset, formatDay, formatHour, toISODate } from '@/i18n/format';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { roundKey, useCup } from '@/store/cups';
import { colors, fonts, radius, space } from '@/theme';

type DraftEvent = { team_id: string; player_id?: string; kind: MatchEvent['kind']; minute?: number };
const KIND_ICON: Record<MatchEvent['kind'], string> = { goal: '⚽', own_goal: '⚽↩︎', yellow: '🟨', red: '🟥' };

export default function FixtureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, tournaments, errText } = useApp();
  const tourId = tournaments.find((x) => x.fixtures.some((f) => f.id === id))?.id;
  const { tour, detail, act, isOrganizer, teamName, playerName, rosterOf, reload } = useCup(tourId);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const f = tour?.fixtures.find((x) => x.id === id);
  const [retention, setRetention] = useState(14);
  const [sheet, setSheet] = useState(false);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [pens, setPens] = useState<[number, number]>([0, 0]);
  const [events, setEvents] = useState<DraftEvent[]>([]);
  const [mvp, setMvp] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [walkover, setWalkover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clipScorer, setClipScorer] = useState<{ uri: string } | null>(null);
  const [delClip, setDelClip] = useState<string | null>(null);
  const [move, setMove] = useState(false);
  const [moveDay, setMoveDay] = useState(1);
  const [moveHour, setMoveHour] = useState(18);

  useEffect(() => {
    api.appSettings().then((s) => setRetention(s.clipRetentionDays)).catch(() => {});
  }, []);

  const fxEvents = useMemo(() => detail.events.filter((e) => e.fixtureId === id).sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)), [detail.events, id]);
  const clips = detail.highlights.filter((h) => h.fixtureId === id);

  if (!tour || !f) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="football-outline" title={t('noResults')} />
      </View>
    );
  }

  const played = isPlayed(f);
  const ko = f.stage === 'knockout';
  const inRound = tour.fixtures.filter((x) => x.stage === 'knockout' && x.roundNo === f.roundNo).length;
  const stageLabel = ko ? t(`round_${roundKey(inRound)}`) : f.groupLabel ? t('groupX', { g: f.groupLabel }) : t('roundN', { n: f.roundNo ?? 1 });
  const labels = { today: t('today'), tomorrow: t('tomorrow') };
  const bothTeams = !!f.homeId && !!f.awayId;
  const suspendedHere = detail.suspensions.filter((s) => s.fixtureId === id);
  const daysLeft = tour.status === 'finished' && tour.finishedAt ? Math.max(0, retention - Math.floor((Date.now() - Date.parse(tour.finishedAt)) / 86400000)) : undefined;

  const openResult = () => {
    setHome(f.score?.[0] ?? 0);
    setAway(f.score?.[1] ?? 0);
    setPens(f.pens ?? [0, 0]);
    setEvents(fxEvents.map((e) => ({ team_id: e.teamId, player_id: e.playerId, kind: e.kind, minute: e.minute })));
    setMvp(f.mvpId ?? null);
    setSheet(true);
  };

  const save = async () => {
    setSaving(true);
    const r = await act(() => api.recordResult(f.id, home, away, ko && home === away ? pens : null, events, mvp));
    setSaving(false);
    if (!r.ok) return toast(errText(r.error), 'error');
    setSheet(false);
    toast(t('resultSaved'), 'success');
  };

  const pickClip = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast(t('photoPermission'), 'error');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      allowsEditing: true,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.duration && a.duration > 61000) return toast(t('clipTooLong'), 'error');
    if (a.fileSize && a.fileSize > 60 * 1024 * 1024) return toast(t('clipTooBig'), 'error');
    setClipScorer({ uri: a.uri });
  };

  const upload = async (playerId: string | null) => {
    const uri = clipScorer!.uri;
    setClipScorer(null);
    setUploading(true);
    const r = await act(() => api.uploadHighlight(tour.id, f.id, uri, playerId));
    setUploading(false);
    toast(r.ok ? t('clipUploaded') : errText(r.error), r.ok ? 'success' : 'error');
  };

  const roster = [...rosterOf(f.homeId), ...rosterOf(f.awayId)];

  const TeamSide = ({ teamId, align }: { teamId?: string; align: 'flex-start' | 'flex-end' }) => {
    const tm = tour.teams.find((x) => x.id === teamId);
    return (
      <Tap onPress={() => teamId && router.push(`/tournament/team/${teamId}?t=${tour.id}`)} disabled={!teamId} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
        {teamDot(tm?.color, 34)}
        <Txt v="bodyStrong" center numberOfLines={2}>
          {teamName(teamId)}
        </Txt>
      </Tap>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={l(tour.name)} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <Card style={{ gap: space.md }}>
          <Txt v="tiny" color={colors.textMuted} center>
            {stageLabel} · {hasTime(f) ? `${formatDay(dateFromOffset(f.dayOffset), lang, labels)} · ${formatHour(f.hour, lang)}` : t('notScheduled')}
          </Txt>
          <Row gap={space.md}>
            <TeamSide teamId={f.homeId} align="flex-start" />
            <View style={{ alignItems: 'center', minWidth: 90 }}>
              <Txt style={{ fontSize: 36, lineHeight: 44, fontFamily: fonts.bold }}>{played && f.score ? `${f.score[0]} - ${f.score[1]}` : t('vs')}</Txt>
              {f.pens && <Txt v="tiny" color={colors.textMuted}>{t('pensShort', { h: f.pens[0], a: f.pens[1] })}</Txt>}
              {f.status === 'walkover' && <Txt v="tiny" color={colors.warning}>{t('walkover')}</Txt>}
            </View>
            <TeamSide teamId={f.awayId} align="flex-end" />
          </Row>
        </Card>

        {suspendedHere.length > 0 && !played && (
          <Card flat style={{ backgroundColor: colors.dangerSoft, gap: 4 }}>
            <Txt v="label" color={colors.danger}>🟥 {t('suspendedThisMatch')}</Txt>
            <Txt v="caption">{suspendedHere.map((s) => `${playerName(s.userId)} (${teamName(s.teamId)})`).join('، ')}</Txt>
          </Card>
        )}

        {played && (fxEvents.length > 0 || f.mvpId) && (
          <Card style={{ gap: space.sm }}>
            {fxEvents.map((e) => {
              const left = e.teamId === f.homeId;
              return (
                <Row key={e.id} justify={left ? 'flex-start' : 'flex-end'} gap={6}>
                  <Txt v="caption">{KIND_ICON[e.kind]}</Txt>
                  <Txt v="bodyStrong">{e.playerId ? playerName(e.playerId) : teamName(e.teamId)}</Txt>
                  {e.minute != null && <Txt v="tiny" color={colors.textMuted}>{`${e.minute}'`}</Txt>}
                </Row>
              );
            })}
            {f.mvpId && (
              <>
                <Divider />
                <Row gap={8} justify="center">
                  <Ionicons name="star" size={18} color={colors.warning} />
                  <Txt v="bodyStrong">{t('mvp')}: {playerName(f.mvpId)}</Txt>
                </Row>
              </>
            )}
          </Card>
        )}

        {isOrganizer && bothTeams && f.status !== 'bye' && (
          <View style={{ gap: space.sm }}>
            <Button title={played ? t('editResult') : t('enterResult')} icon="create-outline" onPress={openResult} />
            {!played && <Button title={t('recordWalkover')} kind="ghost" icon="flag-outline" onPress={() => setWalkover(true)} />}
            {!played && <Button title={t('changeTime')} kind="ghost" icon="time-outline" onPress={() => { setMoveDay(Math.max(0, f.dayOffset < 9999 ? f.dayOffset : 1)); setMoveHour(f.hour || 18); setMove(true); }} />}
          </View>
        )}

        <View style={{ gap: space.sm }}>
          <Row justify="space-between">
            <Txt v="h3">{t('clips')}</Txt>
            {isOrganizer && played && (
              <Button title={t('uploadClip')} small icon={uploading ? 'hourglass-outline' : 'cloud-upload-outline'} disabled={uploading || clips.length >= 10} onPress={pickClip} />
            )}
          </Row>
          {uploading && (
            <Row gap={8}>
              <ActivityIndicator color={colors.primary} />
              <Txt v="caption" color={colors.textMuted}>{t('uploadingClip')}</Txt>
            </Row>
          )}
          {clips.length === 0 && !uploading && <Txt v="caption" color={colors.textMuted}>{isOrganizer ? t('clipLimits') : t('noClips')}</Txt>}
          {clips.map((c) => (
            <ClipPlayer
              key={c.id}
              clip={c}
              title={c.playerId ? `⚽ ${playerName(c.playerId)}` : t('goalClip')}
              liked={detail.liked.has(c.id)}
              expiresInDays={daysLeft}
              onLike={async () => {
                const r = await act(() => api.toggleHighlightLike(c.id));
                if (!r.ok) toast(errText(r.error), 'error');
              }}
              onDelete={isOrganizer ? () => setDelClip(c.id) : undefined}
            />
          ))}
        </View>
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={t('enterResult')}>
        <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Row gap={space.md}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="label" numberOfLines={1}>{teamName(f.homeId)}</Txt>
              <Stepper value={home} onChange={setHome} min={0} max={50} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="label" numberOfLines={1}>{teamName(f.awayId)}</Txt>
              <Stepper value={away} onChange={setAway} min={0} max={50} />
            </View>
          </Row>
          {ko && home === away && (
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('penalties')}</Txt>
              <Row gap={space.md}>
                <View style={{ flex: 1 }}><Stepper value={pens[0]} onChange={(v) => setPens([v, pens[1]])} min={0} max={30} /></View>
                <View style={{ flex: 1 }}><Stepper value={pens[1]} onChange={(v) => setPens([pens[0], v])} min={0} max={30} /></View>
              </Row>
            </View>
          )}

          <View style={{ gap: space.sm }}>
            <Row justify="space-between">
              <Txt v="label" color={colors.textMuted}>{t('scorersAndCards')}</Txt>
              <Button title={t('addEvent')} small kind="secondary" icon="add" onPress={() => setDraft({ team_id: f.homeId!, kind: 'goal' })} />
            </Row>
            {events.map((e, i) => (
              <Row key={i} gap={8}>
                <Txt v="caption">{KIND_ICON[e.kind]}</Txt>
                <Txt v="bodyStrong" style={{ flex: 1 }}>{e.player_id ? playerName(e.player_id) : teamName(e.team_id)}</Txt>
                {e.minute != null && <Txt v="tiny" color={colors.textMuted}>{`${e.minute}'`}</Txt>}
                <Tap onPress={() => setEvents(events.filter((_, j) => j !== i))} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </Tap>
              </Row>
            ))}
            {draft && (
              <Card flat style={{ gap: space.sm, borderWidth: 1, borderColor: colors.border }}>
                <Row gap={8} wrap>
                  {(['goal', 'own_goal', 'yellow', 'red'] as const).map((k) => (
                    <Chip key={k} label={`${KIND_ICON[k]} ${t(`ev_${k}`)}`} selected={draft.kind === k} onPress={() => setDraft({ ...draft, kind: k })} />
                  ))}
                </Row>
                <Row gap={8} wrap>
                  {[f.homeId!, f.awayId!].map((tid) => (
                    <Chip key={tid} label={teamName(tid)} selected={draft.team_id === tid} onPress={() => setDraft({ ...draft, team_id: tid, player_id: undefined })} />
                  ))}
                </Row>
                <Row gap={6} wrap>
                  {rosterOf(draft.team_id).map((p) => (
                    <Chip key={p.userId} label={p.name || t('player')} selected={draft.player_id === p.userId} onPress={() => setDraft({ ...draft, player_id: p.userId })} />
                  ))}
                </Row>
                <TextInput
                  value={draft.minute != null ? String(draft.minute) : ''}
                  onChangeText={(v) => setDraft({ ...draft, minute: v ? Math.min(200, Number(v.replace(/\D/g, ''))) : undefined })}
                  keyboardType="number-pad"
                  placeholder={t('minuteOptional')}
                  placeholderTextColor={colors.textFaint}
                  style={{ height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.medium, ...webNoOutline }}
                />
                <Row gap={space.sm}>
                  <Button title={t('add')} small icon="checkmark" style={{ flex: 1 }} onPress={() => { setEvents([...events, draft]); setDraft(null); }} />
                  <Button title={t('cancel')} small kind="ghost" style={{ flex: 1 }} onPress={() => setDraft(null)} />
                </Row>
              </Card>
            )}
          </View>

          <View style={{ gap: space.sm }}>
            <Txt v="label" color={colors.textMuted}>{t('mvp')}</Txt>
            <Row gap={6} wrap>
              {roster.map((p) => (
                <Chip key={p.userId} label={p.name || t('player')} icon="star-outline" selected={mvp === p.userId} onPress={() => setMvp(mvp === p.userId ? null : p.userId)} />
              ))}
            </Row>
          </View>
          <Button title={t('saveResult')} icon="checkmark-circle" loading={saving} onPress={save} />
        </ScrollView>
      </Sheet>

      <Sheet visible={walkover} onClose={() => setWalkover(false)} title={t('recordWalkover')}>
        <View style={{ gap: space.md }}>
          <Txt v="body" color={colors.textMuted}>{t('walkoverBody')}</Txt>
          {[f.homeId, f.awayId].filter(Boolean).map((tid) => (
            <Button
              key={tid}
              title={t('winsByWalkover', { team: teamName(tid) })}
              kind="secondary"
              onPress={async () => {
                setWalkover(false);
                const r = await act(() => api.recordWalkover(f.id, tid!));
                toast(r.ok ? t('resultSaved') : errText(r.error), r.ok ? 'success' : 'error');
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet visible={!!clipScorer} onClose={() => setClipScorer(null)} title={t('whoScored')}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.sm }}>
          <Row gap={6} wrap>
            {roster.map((p) => (
              <Chip key={p.userId} label={p.name || t('player')} onPress={() => upload(p.userId)} />
            ))}
          </Row>
          <Button title={t('skipScorer')} kind="ghost" onPress={() => upload(null)} />
        </ScrollView>
      </Sheet>

      <Sheet visible={move} onClose={() => setMove(false)} title={t('changeTime')}>
        <View style={{ gap: space.lg }}>
          <View style={{ gap: 4 }}>
            <Txt v="label" color={colors.textMuted}>{t('day')}</Txt>
            <Stepper value={moveDay} onChange={setMoveDay} min={0} max={120} format={(v) => formatDay(dateFromOffset(v), lang, labels)} />
          </View>
          <View style={{ gap: 4 }}>
            <Txt v="label" color={colors.textMuted}>{t('time')}</Txt>
            <Stepper value={moveHour} onChange={setMoveHour} min={0} max={23.5} step={0.5} format={(v) => formatHour(v, lang)} />
          </View>
          <Button
            title={t('save')}
            icon="checkmark-circle"
            onPress={async () => {
              setMove(false);
              const d = toISODate(dateFromOffset(moveDay));
              const hh = String(Math.floor(moveHour)).padStart(2, '0');
              const mm = moveHour % 1 ? '30' : '00';
              const r = await act(() => api.rescheduleFixture(f.id, `${d}T${hh}:${mm}:00+03:00`));
              toast(r.ok ? t('timeChanged') : errText(r.error), r.ok ? 'success' : 'error');
            }}
          />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={!!delClip}
        onClose={() => setDelClip(null)}
        title={t('deleteClipConfirm')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={async () => {
          const cid = delClip!;
          setDelClip(null);
          const r = await act(() => api.deleteHighlight(cid));
          toast(r.ok ? t('done') : errText(r.error), r.ok ? 'info' : 'error');
          reload();
        }}
      />
    </View>
  );
}
