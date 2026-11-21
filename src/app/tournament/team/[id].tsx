/** A tournament team: roster, invite code for the captain, leave / remove / withdraw. */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FixtureRow, teamDot } from '@/components/cup';
import { ConfirmSheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Badge, Button, Card, Divider, EmptyState, IconButton, Row, Txt } from '@/components/ui';
import { WEB_URL } from '@/config';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { useCup } from '@/store/cups';
import { useEngagement } from '@/store/engagement';
import { colors, radius, space } from '@/theme';

export default function TeamScreen() {
  const { id, t: tid } = useLocalSearchParams<{ id: string; t?: string }>();
  const { t, l, money, tournaments, meId, errText } = useApp();
  const tourId = tid ?? tournaments.find((x) => x.teams.some((tm) => tm.id === id))?.id;
  const { tour, rosterOf, detail, act, isOrganizer, live } = useCup(tourId);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const team = tour?.teams.find((tm) => tm.id === id);
  const [code, setCode] = useState<string | null>(null);
  const { teams: fixedTeams } = useEngagement();
  const [confirm, setConfirm] = useState<null | { kind: 'leave' | 'remove' | 'withdraw'; userId?: string }>(null);

  const roster = rosterOf(id);
  const isCaptain = team?.captainId === meId;
  const isMember = roster.some((p) => p.userId === meId);
  const suspended = new Set(detail.suspensions.filter((s) => s.teamId === id).map((s) => s.userId));

  useEffect(() => {
    if (live && id && (isMember || isOrganizer)) api.teamInviteCode(id).then(setCode).catch(() => {});
  }, [live, id, isMember, isOrganizer]);

  if (!tour || !team) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="shield-outline" title={t('noResults')} />
      </View>
    );
  }

  const invite = () =>
    Share.share({
      message: t('inviteMessage', { team: l(team.name), cup: l(tour.name), code: code ?? '', link: `${WEB_URL}/tournament/join?code=${code ?? ''}` }),
    }).catch(() => {});

  const fixtures = tour.fixtures.filter((f) => (f.homeId === id || f.awayId === id) && f.status !== 'bye');
  const max = tour.maxPlayers ?? 10;
  const min = tour.minPlayers ?? 5;

  const run = async () => {
    const c = confirm!;
    setConfirm(null);
    const r =
      c.kind === 'withdraw' ? await act(() => api.withdrawTeam(id)) : await act(() => api.removeTeamPlayer(id, c.kind === 'leave' ? meId : c.userId!));
    if (!r.ok) return toast(errText(r.error), 'error');
    toast(t('done'), 'info');
    if (c.kind === 'leave' || c.kind === 'withdraw') router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={l(team.name)} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <Card style={{ gap: space.sm, alignItems: 'center' }}>
          {teamDot(team.color, 40)}
          <Txt v="h2">{l(team.name)}</Txt>
          <Txt v="caption" color={colors.textMuted}>
            {l(tour.name)}
            {team.groupLabel ? ` · ${t('groupX', { g: team.groupLabel })}` : ''}
          </Txt>
          <Row gap={6} wrap justify="center">
            {team.status === 'pending' && <Badge label={t('teamPending')} color={colors.warning} bg={colors.warningSoft} icon="time-outline" />}
            {team.status === 'approved' && <Badge label={t('teamApproved')} color={colors.success} bg={colors.successSoft} icon="checkmark-circle" />}
            {team.status === 'withdrawn' && <Badge label={t('teamWithdrawn')} color={colors.textMuted} bg={colors.surfaceMuted} />}
            {team.status === 'rejected' && <Badge label={t('teamRejected')} color={colors.danger} bg={colors.dangerSoft} />}
            {tour.entryFee > 0 && (team.paid ? <Badge label={t('feePaid')} color={colors.success} bg={colors.successSoft} icon="cash-outline" /> : <Badge label={t('feeUnpaid', { fee: money(tour.entryFee) })} color={colors.warning} bg={colors.warningSoft} icon="cash-outline" />)}
          </Row>
          {team.status === 'pending' && isMember && (
            <Txt v="caption" color={colors.textMuted} center>
              {t('teamPendingHint')}
            </Txt>
          )}
        </Card>

        {(isMember || isOrganizer) && code && team.status !== 'withdrawn' && (
          <Card style={{ gap: space.sm, backgroundColor: colors.primarySoft }}>
            <Txt v="label" color={colors.textMuted}>{t('inviteCode')}</Txt>
            <Row justify="space-between">
              <Txt style={{ fontSize: 30, letterSpacing: 6 }} color={colors.primary}>
                {code}
              </Txt>
              <Button title={t('invitePlayers')} small icon="share-social" onPress={invite} />
            </Row>
            <Txt v="tiny" color={colors.textMuted}>
              {t('inviteHint')}
            </Txt>
          </Card>
        )}

        {isCaptain && fixedTeams.length > 0 && team.status !== 'withdrawn' && (
          <Card style={{ gap: space.sm }}>
            <Txt v="label" color={colors.textMuted}>{t('inviteFixedTeam')}</Txt>
            <Row gap={8} wrap>
              {fixedTeams.map((ft) => (
                <Button
                  key={ft.id}
                  title={ft.name}
                  small
                  kind="secondary"
                  icon="shirt-outline"
                  onPress={async () => {
                    try {
                      const n = await api.inviteFixedTeam(id, ft.id);
                      toast(t('invitesSent', { n }), 'success');
                    } catch (e) {
                      toast(errText(api.errorCode(e)), 'error');
                    }
                  }}
                />
              ))}
            </Row>
          </Card>
        )}

        <View style={{ gap: space.sm }}>
          <Row justify="space-between">
            <Txt v="h3">{t('roster')}</Txt>
            <Txt v="caption" color={roster.length < min ? colors.warning : colors.textMuted}>
              {t('rosterCount', { n: roster.length, max })}
            </Txt>
          </Row>
          {roster.length < min && (
            <Txt v="caption" color={colors.warning}>
              {t('rosterMin', { min })}
            </Txt>
          )}
          <Card style={{ paddingVertical: space.xs }}>
            {roster.length === 0 && <Txt v="caption" color={colors.textMuted} style={{ paddingVertical: space.md }}>{t('noPlayersYet')}</Txt>}
            {roster.map((p, i) => (
              <View key={p.userId}>
                <Row gap={space.md} style={{ paddingVertical: 10 }}>
                  <Avatar name={p.name || '?'} uri={p.avatarUrl} size={38} color={team.color} />
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong">{p.name || t('player')}</Txt>
                    <Row gap={6}>
                      {p.userId === team.captainId && <Txt v="tiny" color={colors.primary}>{t('captain')}</Txt>}
                      {suspended.has(p.userId) && <Txt v="tiny" color={colors.danger}>🟥 {t('suspendedNext')}</Txt>}
                    </Row>
                  </View>
                  {(isCaptain || isOrganizer) && p.userId !== team.captainId && (
                    <IconButton icon="person-remove-outline" label={t('remove')} size={34} color={colors.danger} bg={colors.dangerSoft} onPress={() => setConfirm({ kind: 'remove', userId: p.userId })} />
                  )}
                </Row>
                {i < roster.length - 1 && <Divider />}
              </View>
            ))}
          </Card>
        </View>

        {fixtures.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Txt v="h3">{t('fixtures')}</Txt>
            {fixtures.map((f) => (
              <FixtureRow key={f.id} tour={tour} f={f} highlight={id} compact />
            ))}
          </View>
        )}

        {isMember && !isCaptain && <Button title={t('leaveTeam')} kind="ghost" icon="exit-outline" onPress={() => setConfirm({ kind: 'leave' })} />}
        {(isCaptain || isOrganizer) && team.status !== 'withdrawn' && tour.status !== 'finished' && (
          <Button title={t('withdrawTeam')} kind="danger" icon="flag-outline" onPress={() => setConfirm({ kind: 'withdraw' })} />
        )}
        {!isMember && !isOrganizer && (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Ionicons name="key-outline" size={20} color={colors.textMuted} />
            <Txt v="caption" color={colors.textMuted} center>
              {t('joinTeamHint')}
            </Txt>
          </View>
        )}
      </ScrollView>
      <ConfirmSheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'withdraw' ? t('withdrawTeamConfirm') : confirm?.kind === 'leave' ? t('leaveTeamConfirm') : t('removePlayerConfirm')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={run}
      />
    </View>
  );
}
