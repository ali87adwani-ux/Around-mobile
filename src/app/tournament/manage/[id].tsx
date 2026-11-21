/** Organiser dashboard for one tournament: teams & payments, schedule, results, awards, cancel. */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stepper } from '@/components/academy';
import { statusBadge } from '@/components/cards';
import { FixtureRow, teamDot } from '@/components/cup';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, Card, Chip, Divider, EmptyState, Row, Segmented, Tap, Txt } from '@/components/ui';
import { dateFromOffset, formatDay, formatHour, toISODate, weekdayShort } from '@/i18n/format';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { useCup } from '@/store/cups';
import { colors, space } from '@/theme';

type Tab = 'teams' | 'schedule' | 'awards';

export default function ManageTournament() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, lang, money, getPitch, errText } = useApp();
  const { tour, detail, act, isOrganizer, rosterOf, playerName, loading, reload } = useCup(id);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('teams');
  const [gen, setGen] = useState(false);
  const [startOff, setStartOff] = useState(Math.max(1, tour?.startOffset ?? 1));
  const [days, setDays] = useState<number[]>([4, 5, 6]);
  const [hour, setHour] = useState(18);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'close' | 'cancel'>(null);
  const [awardPick, setAwardPick] = useState<null | 'best_player' | 'best_keeper'>(null);

  if (!tour || !isOrganizer) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="lock-closed-outline" title={t('noResults')} />
      </View>
    );
  }

  const pitch = getPitch(tour.pitchId);
  const teams = tour.teams;
  const approved = teams.filter((tm) => tm.status === 'approved');
  const pending = teams.filter((tm) => tm.status === 'pending');
  const paidCount = teams.filter((tm) => tm.paid).length;
  const fees = paidCount * tour.entryFee;
  const commission = Math.round((tour.commissionRate ?? 0) * fees * 1000) / 1000;
  const canSchedule = ['open', 'closed'].includes(tour.status) || (tour.status === 'live' && !tour.fixtures.some((f) => f.status === 'played' || f.status === 'walkover'));
  const minTeams = tour.formatType === 'groups' ? (tour.groupsCount ?? 2) * 2 : 2;

  const run = async (key: string, fn: () => Promise<unknown>, okMsg = t('done')) => {
    setBusy(key);
    const r = await act(fn);
    setBusy(null);
    toast(r.ok ? okMsg : errText(r.error), r.ok ? 'success' : 'error');
    return r.ok;
  };

  const [short, setShort] = useState<{ team_id: string; players: number; min_players: number }[] | null>(null);
  const openGenerate = async () => {
    try {
      const rows = await api.rosterCheck(tour.id);
      if (rows.length) return setShort(rows);
    } catch {}
    setGen(true);
  };
  const generate = async () => {
    if (await run('gen', () => api.generateFixtures(tour.id, toISODate(dateFromOffset(startOff)), days, hour), t('scheduleGenerated'))) {
      setGen(false);
      setTab('schedule');
    }
  };

  const award = (kind: 'best_player' | 'best_keeper') => detail.awards.find((a) => a.kind === kind);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('manageTournament')} right={<Tap onPress={() => router.push(`/tournament/${tour.id}`)} hitSlop={10}><Ionicons name="eye-outline" size={22} color={colors.text} /></Tap>} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
        <Card style={{ gap: space.sm }}>
          <Row justify="space-between" gap={space.sm}>
            <Txt v="h2" style={{ flex: 1 }}>{l(tour.name)}</Txt>
            {statusBadge(tour.status, t)}
          </Row>
          <Txt v="caption" color={colors.textMuted}>
            {l(pitch.name)} · {t(`fmt_${tour.formatType ?? 'league'}`)} · {t('aSide', { n: tour.format })}
          </Txt>
          {tour.status === 'pending' && <Txt v="caption" color={colors.warning}>{t('tournamentPendingHint')}</Txt>}
          {tour.status === 'rejected' && <Txt v="caption" color={colors.danger}>{t('tournamentRejected')}{tour.rejectReason ? `: ${tour.rejectReason}` : ''}</Txt>}
          <Divider />
          <Row justify="space-between">
            <Txt v="caption" color={colors.textMuted}>{t('teamsApprovedN', { n: approved.length, max: tour.maxTeams })}</Txt>
            <Txt v="caption" color={colors.textMuted}>{t('paidTeamsN', { n: paidCount })} · {money(fees)}</Txt>
          </Row>
          {(tour.commissionRate ?? 0) > 0 && (
            <Row justify="space-between">
              <Txt v="caption" color={colors.textMuted}>{t('organizingFeePct', { pct: Math.round((tour.commissionRate ?? 0) * 100) })}</Txt>
              <Txt v="label" color={colors.warning}>{money(commission)}</Txt>
            </Row>
          )}
        </Card>

        {!['finished', 'cancelled', 'rejected'].includes(tour.status) && (
          <Button title={t('editTournament')} kind="ghost" icon="create-outline" onPress={() => router.push(`/tournament/edit/${tour.id}`)} />
        )}
        {tour.status === 'open' && (
          <Button title={t('closeRegistration')} kind="secondary" icon="lock-closed-outline" onPress={() => setConfirm('close')} />
        )}
        {canSchedule && tour.status !== 'pending' && tour.status !== 'rejected' && (
          <Button
            title={tour.fixtures.length ? t('regenerateSchedule') : t('generateSchedule')}
            icon="calendar"
            disabled={approved.length < minTeams}
            onPress={openGenerate}
          />
        )}
        {canSchedule && approved.length < minTeams && tour.status !== 'pending' && (
          <Txt v="caption" color={colors.textMuted} center>{t('needTeamsToSchedule', { n: minTeams })}</Txt>
        )}

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'teams', label: `${t('teams')}${pending.length ? ` (${pending.length})` : ''}` },
            { value: 'schedule', label: t('fixtures') },
            { value: 'awards', label: t('awards') },
          ]}
        />

        {tab === 'teams' &&
          (teams.length === 0 ? (
            <EmptyState icon="shield-outline" title={t('noTeamsYet')} body={t('shareToGetTeams')} />
          ) : (
            teams.map((tm) => {
              const n = rosterOf(tm.id).length;
              const inactive = tm.status === 'rejected' || tm.status === 'withdrawn';
              return (
                <Card key={tm.id} style={{ gap: space.sm, opacity: inactive ? 0.6 : 1 }}>
                  <Tap onPress={() => router.push(`/tournament/team/${tm.id}?t=${tour.id}`)} scale={0.99}>
                    <Row gap={space.md}>
                      {teamDot(tm.color, 14)}
                      <View style={{ flex: 1 }}>
                        <Txt v="bodyStrong">{l(tm.name)}</Txt>
                        <Txt v="tiny" color={n < (tour.minPlayers ?? 1) ? colors.warning : colors.textMuted}>
                          {t('rosterCount', { n, max: tour.maxPlayers ?? 10 })} · {t('captain')}: {playerName(tm.captainId)}
                        </Txt>
                      </View>
                      <Badge
                        label={t(`teamStatus_${tm.status ?? 'approved'}`)}
                        color={tm.status === 'approved' ? colors.success : tm.status === 'pending' ? colors.warning : colors.textMuted}
                        bg={tm.status === 'approved' ? colors.successSoft : tm.status === 'pending' ? colors.warningSoft : colors.surfaceMuted}
                      />
                    </Row>
                  </Tap>
                  {!inactive && (
                    <Row gap={space.sm} wrap>
                      {tour.entryFee > 0 && (
                        <Chip
                          label={tm.paid ? `✓ ${t('feePaid')}` : t('markPaid')}
                          icon="cash-outline"
                          selected={!!tm.paid}
                          onPress={() => run(`p${tm.id}`, () => api.organizerReviewTeam(tm.id, tm.paid ? tm.status ?? 'approved' : 'approved', !tm.paid))}
                        />
                      )}
                      {tm.status !== 'approved' && (
                        <Button title={t('approve')} small icon="checkmark" loading={busy === `a${tm.id}`} onPress={() => run(`a${tm.id}`, () => api.organizerReviewTeam(tm.id, 'approved', null))} />
                      )}
                      {tm.status === 'pending' && (
                        <Button title={t('reject')} small kind="danger" icon="close" onPress={() => run(`r${tm.id}`, () => api.organizerReviewTeam(tm.id, 'rejected', null))} />
                      )}
                    </Row>
                  )}
                </Card>
              );
            })
          ))}

        {tab === 'schedule' &&
          (tour.fixtures.filter((f) => f.status !== 'bye').length === 0 ? (
            <EmptyState icon="calendar-outline" title={t('noFixtures')} body={t('generateHint')} />
          ) : (
            <View style={{ gap: space.sm }}>
              <Txt v="caption" color={colors.textMuted}>{t('tapMatchToEnter')}</Txt>
              {tour.fixtures
                .filter((f) => f.status !== 'bye')
                .map((f) => (
                  <FixtureRow key={f.id} tour={tour} f={f} compact />
                ))}
            </View>
          ))}

        {tab === 'awards' && (
          <View style={{ gap: space.sm }}>
            {(['best_player', 'best_keeper'] as const).map((k) => (
              <Card key={k} style={{ gap: space.sm }}>
                <Row justify="space-between">
                  <Txt v="h3">{t(`award_${k}`)}</Txt>
                  <Button title={award(k) ? t('change') : t('choose')} small kind="secondary" onPress={() => setAwardPick(k)} />
                </Row>
                <Txt v="body" color={award(k) ? colors.text : colors.textMuted}>{award(k) ? playerName(award(k)!.userId) : t('notChosen')}</Txt>
              </Card>
            ))}
            <Txt v="caption" color={colors.textMuted}>{t('autoAwardsHint')}</Txt>
          </View>
        )}

        {tour.status !== 'finished' && tour.status !== 'cancelled' && (
          <Button title={t('cancelTournament')} kind="ghost" icon="close-circle-outline" onPress={() => setConfirm('cancel')} />
        )}
      </ScrollView>

      <Sheet visible={gen} onClose={() => setGen(false)} title={t('generateSchedule')}>
        <View style={{ gap: space.lg }}>
          <Txt v="caption" color={colors.textMuted}>{t('generateBody', { n: approved.length })}</Txt>
          <View style={{ gap: 4 }}>
            <Txt v="label" color={colors.textMuted}>{t('firstMatchDay')}</Txt>
            <Stepper value={startOff} onChange={setStartOff} min={1} max={120} format={(v) => formatDay(dateFromOffset(v), lang, { today: t('today'), tomorrow: t('tomorrow') })} />
          </View>
          <View style={{ gap: 6 }}>
            <Txt v="label" color={colors.textMuted}>{t('matchDays')}</Txt>
            <Row gap={6} wrap>
              {[0, 1, 2, 3, 4, 5, 6].map((dw) => {
                const sample = new Date(2026, 10, 22 + dw); // 22 Nov 2026 is a Sunday
                return <Chip key={dw} label={weekdayShort(sample, lang)} selected={days.includes(dw)} onPress={() => setDays(days.includes(dw) ? days.filter((x) => x !== dw) : [...days, dw])} />;
              })}
            </Row>
          </View>
          <View style={{ gap: 4 }}>
            <Txt v="label" color={colors.textMuted}>{t('firstKickoff')}</Txt>
            <Stepper value={hour} onChange={setHour} min={pitch.openFrom} max={pitch.openTo - 1} format={(v) => formatHour(v, lang)} />
          </View>
          <Card flat style={{ backgroundColor: colors.primarySoft }}>
            <Txt v="caption">{t('scheduleBlocksPitch')}</Txt>
          </Card>
          <Button title={t('generateSchedule')} icon="calendar" disabled={!days.length} loading={busy === 'gen'} onPress={generate} />
        </View>
      </Sheet>

      <Sheet visible={!!awardPick} onClose={() => setAwardPick(null)} title={awardPick ? t(`award_${awardPick}`) : ''}>
        <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: space.sm }}>
          <Row gap={6} wrap>
            {detail.players.map((p) => (
              <Chip
                key={p.userId}
                label={p.name || t('player')}
                selected={award(awardPick ?? 'best_player')?.userId === p.userId}
                onPress={async () => {
                  const k = awardPick!;
                  setAwardPick(null);
                  await run('award', () => api.setAward(tour.id, k, p.userId));
                }}
              />
            ))}
          </Row>
          {award(awardPick ?? 'best_player') && (
            <Button title={t('clearAward')} kind="ghost" onPress={async () => { const k = awardPick!; setAwardPick(null); await run('award', () => api.setAward(tour.id, k, null)); }} />
          )}
        </ScrollView>
      </Sheet>

      <ConfirmSheet
        visible={!!short}
        onClose={() => setShort(null)}
        title={t('rosterShortTitle', { list: (short ?? []).map((r) => `${l(teams.find((tm) => tm.id === r.team_id)?.name ?? { ar: '', en: '' })} (${r.players}/${r.min_players})`).join('، ') })}
        confirmLabel={t('generateAnyway')}
        cancelLabel={t('back')}
        onConfirm={() => {
          setShort(null);
          setGen(true);
        }}
      />
      <ConfirmSheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'cancel' ? t('cancelTournamentConfirm') : t('closeRegistrationConfirm')}
        confirmLabel={t('confirm')}
        cancelLabel={t('back')}
        danger={confirm === 'cancel'}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          if (c === 'cancel') await run('cancel', () => api.cancelTournament(tour.id));
          else await run('close', () => api.closeRegistration(tour.id));
        }}
      />
    </View>
  );
}

