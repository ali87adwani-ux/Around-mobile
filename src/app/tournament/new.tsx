/** Create a tournament: pitch owners on their own pitches (reviewed by an admin), admins anywhere. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stepper } from '@/components/academy';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, Chip, Field, Row, Segmented, Txt, haptic } from '@/components/ui';
import type { TournamentFormat, PitchSize } from '@/data/types';
import { dateFromOffset, formatDay, toISODate } from '@/i18n/format';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

const AGES = ['open', 'u10', 'u12', 'u14', 'u16', 'u18', 'o30', 'o35'];

export default function NewTournament() {
  const { t, l, lang, money, role, pitches, ownerPitches, errText, refresh, mode } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isAdmin = role === 'admin';
  const choices = isAdmin ? pitches : ownerPitches;
  const [pitchId, setPitchId] = useState(choices[0]?.id ?? '');
  const pitch = choices.find((p) => p.id === pitchId);
  const [name, setName] = useState('');
  const [type, setType] = useState<TournamentFormat>('league');
  const [groups, setGroups] = useState(2);
  const [format, setFormat] = useState<PitchSize>((pitch?.sizes[0] as PitchSize) ?? 5);
  const [maxTeams, setMaxTeams] = useState(8);
  const [minP, setMinP] = useState(5);
  const [maxP, setMaxP] = useState(10);
  const [age, setAge] = useState('open');
  const [startOff, setStartOff] = useState(14);
  const [fee, setFee] = useState(50);
  const [prize, setPrize] = useState(300);
  const [prize2, setPrize2] = useState(100);
  const [rules, setRules] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [slot, setSlot] = useState(60);
  const [deadlineOff, setDeadlineOff] = useState<number | null>(null);
  const [rate, setRate] = useState(0.05);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pitch && !pitch.sizes.includes(format)) setFormat(pitch.sizes[0] as PitchSize);
    if (mode === 'live' && pitchId) api.commissionRateFor(pitchId).then(setRate).catch(() => {});
  }, [pitchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (type === 'groups' && maxTeams < groups * 2) setMaxTeams(groups * 2);
  }, [type, groups, maxTeams]);

  const owe = useMemo(() => Math.round(rate * fee * maxTeams * 1000) / 1000, [rate, fee, maxTeams]);

  const submit = async () => {
    setTried(true);
    if (name.trim().length < 3 || !pitch) return haptic.warn();
    if (mode !== 'live') return toast(errText('live_only'), 'error');
    setBusy(true);
    try {
      const id = await api.createTournament({
        name: name.trim(), pitchId, format, formatType: type, groupsCount: groups, startsOn: toISODate(dateFromOffset(startOff)), maxTeams,
        minPlayers: minP, maxPlayers: Math.max(maxP, minP), ageCategory: age, entryFee: fee, prize, prizeSecond: prize2, rules: rules.trim(),
      });
      if (nameEn.trim() || slot !== 60 || deadlineOff != null) {
        await api
          .updateTournament(id, {
            nameAr: name.trim(), nameEn: nameEn.trim(), fee, prize, prize2, rules: rules.trim(), maxTeams, startsOn: toISODate(dateFromOffset(startOff)),
            regDeadline: deadlineOff == null ? null : toISODate(dateFromOffset(Math.min(deadlineOff, startOff))), minPlayers: minP, maxPlayers: Math.max(maxP, minP), slotMinutes: slot,
          })
          .catch(() => {});
      }
      await refresh();
      haptic.success();
      toast(isAdmin ? t('tournamentPublished') : t('tournamentSent'), 'success');
      router.replace(`/tournament/manage/${id}`);
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(false);
  };

  if (!choices.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('newTournament')} />
        <View style={{ padding: space.xl, gap: space.md }}>
          <Txt v="h2">{t('needApprovedPitch')}</Txt>
          <Button title={t('listPitch')} icon="add" onPress={() => router.replace('/listings')} />
        </View>
      </View>
    );
  }

  const label = (s: string) => (
    <Txt v="label" color={colors.textMuted}>
      {s}
    </Txt>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('newTournament')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <Field label={t('tournamentName')} placeholder={t('tournamentNamePh')} value={name} onChangeText={setName} error={tried && name.trim().length < 3 ? t('required') : undefined} />

        <Field label={t('nameEnOptional')} placeholder="e.g. Ramadan Cup" value={nameEn} onChangeText={setNameEn} autoCapitalize="words" />

        <View style={{ gap: space.sm }}>
          {label(t('choosePitch'))}
          <Row gap={8} wrap>
            {choices.map((p) => (
              <Chip key={p.id} label={l(p.name)} selected={pitchId === p.id} onPress={() => setPitchId(p.id)} />
            ))}
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          {label(t('tournamentSystem'))}
          <Segmented<TournamentFormat>
            value={type}
            onChange={setType}
            options={[
              { value: 'league', label: t('fmt_league') },
              { value: 'knockout', label: t('fmt_knockout') },
              { value: 'groups', label: t('fmt_groups') },
            ]}
          />
          <Txt v="tiny" color={colors.textMuted}>
            {type === 'groups' ? t('fmtGroupsLong', { n: groups }) : t(`fmt_${type}_long`)}
          </Txt>
          {type === 'groups' && (
            <Row gap={8}>
              {[2, 4].map((g) => (
                <Chip key={g} label={t('groupsN', { n: g })} selected={groups === g} onPress={() => setGroups(g)} />
              ))}
            </Row>
          )}
        </View>

        <View style={{ gap: space.sm }}>
          {label(t('matchSize'))}
          <Row gap={8}>
            {(pitch?.sizes ?? [5]).map((n) => (
              <Chip key={n} label={t('aSide', { n })} selected={format === n} onPress={() => setFormat(n as PitchSize)} />
            ))}
          </Row>
        </View>

        <Row gap={space.md}>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('teamsCountLabel'))}
            <Stepper value={maxTeams} onChange={setMaxTeams} min={type === 'groups' ? groups * 2 : 3} max={32} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('startDate'))}
            <Stepper value={startOff} onChange={setStartOff} min={1} max={120} format={(v) => formatDay(dateFromOffset(v), lang, { today: t('today'), tomorrow: t('tomorrow') })} />
          </View>
        </Row>

        <Row gap={space.md}>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('minPlayers'))}
            <Stepper value={minP} onChange={(v) => { setMinP(v); if (maxP < v) setMaxP(v); }} min={1} max={20} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('maxPlayers'))}
            <Stepper value={maxP} onChange={(v) => setMaxP(Math.max(v, minP))} min={1} max={30} />
          </View>
        </Row>

        <View style={{ gap: 6 }}>
          {label(t('regDeadline'))}
          <Row gap={8} wrap>
            <Chip label={t('noDeadline')} selected={deadlineOff == null} onPress={() => setDeadlineOff(null)} />
            <Chip label={t('setDeadline')} selected={deadlineOff != null} onPress={() => setDeadlineOff(Math.max(0, startOff - 2))} />
          </Row>
          {deadlineOff != null && (
            <Stepper value={deadlineOff} onChange={(v) => setDeadlineOff(Math.min(v, startOff))} min={0} max={startOff} format={(v) => formatDay(dateFromOffset(v), lang, { today: t('today'), tomorrow: t('tomorrow') })} />
          )}
        </View>

        <View style={{ gap: 6 }}>
          {label(t('matchLength'))}
          <Row gap={8}>
            {[60, 90, 120].map((m) => (
              <Chip key={m} label={t('minutes', { n: m })} selected={slot === m} onPress={() => setSlot(m)} />
            ))}
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          {label(t('ageCategory'))}
          <Row gap={8} wrap>
            {AGES.map((a) => (
              <Chip key={a} label={t(`age_${a}` as never)} selected={age === a} onPress={() => setAge(a)} />
            ))}
          </Row>
        </View>

        <View style={{ gap: 4 }}>
          {label(t('entryFeePerTeam'))}
          <Stepper value={fee} onChange={setFee} min={0} max={1000} step={5} format={(v) => money(v)} />
        </View>
        <Row gap={space.md}>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('prize'))}
            <Stepper value={prize} onChange={setPrize} min={0} max={10000} step={25} format={(v) => money(v)} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('runnerUpPrize'))}
            <Stepper value={prize2} onChange={setPrize2} min={0} max={10000} step={25} format={(v) => money(v)} />
          </View>
        </Row>

        <Field label={t('rulesOptional')} placeholder={t('rulesPh')} value={rules} onChangeText={setRules} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />

        {!isAdmin && (
          <Card flat style={{ backgroundColor: colors.primarySoft, gap: 6 }}>
            <Row gap={8}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <Txt v="bodyStrong" color={colors.primary} style={{ flex: 1 }}>
                {t('organizingFeeTitle', { pct: Math.round(rate * 100) })}
              </Txt>
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {t('organizingFeeBody', { pct: Math.round(rate * 100), example: money(owe), teams: maxTeams })}
            </Txt>
            <Txt v="caption" color={colors.textMuted}>
              {t('tournamentReviewNote')}
            </Txt>
          </Card>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={isAdmin ? t('publishTournament') : t('sendForReview')} icon="trophy" loading={busy} onPress={submit} />
      </View>
    </View>
  );
}
