/** Organiser edits a tournament: names, fees, prizes, rules, teams, dates, registration deadline, match length. */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stepper } from '@/components/academy';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Chip, EmptyState, Field, Row, Txt, haptic } from '@/components/ui';
import { dateFromOffset, formatDay, kwOffset, toISODate } from '@/i18n/format';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { useCup } from '@/store/cups';
import { colors, space } from '@/theme';

export default function EditTournament() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, money, errText, refresh } = useApp();
  const { tour, isOrganizer } = useCup(id);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [nameAr, setNameAr] = useState(tour?.name.ar ?? '');
  const [nameEn, setNameEn] = useState(tour && tour.name.en !== tour.name.ar ? tour.name.en : '');
  const [fee, setFee] = useState(tour?.entryFee ?? 0);
  const [prize, setPrize] = useState(tour?.prize ?? 0);
  const [prize2, setPrize2] = useState(tour?.prizeSecond ?? 0);
  const [rules, setRules] = useState(tour?.rules ?? '');
  const [maxTeams, setMaxTeams] = useState(tour?.maxTeams ?? 8);
  const [startOff, setStartOff] = useState(Math.max(1, tour?.startOffset ?? 7));
  const [deadlineOff, setDeadlineOff] = useState<number | null>(tour?.regDeadline ? kwOffset(tour.regDeadline) : null);
  const [minP, setMinP] = useState(tour?.minPlayers ?? 5);
  const [maxP, setMaxP] = useState(tour?.maxPlayers ?? 10);
  const [slot, setSlot] = useState(tour?.slotMinutes ?? 60);
  const [busy, setBusy] = useState(false);

  if (!tour || !isOrganizer) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="lock-closed-outline" title={t('noResults')} />
      </View>
    );
  }

  const labels = { today: t('today'), tomorrow: t('tomorrow') };
  const day = (v: number) => formatDay(dateFromOffset(v), lang, labels);
  const label = (s: string) => <Txt v="label" color={colors.textMuted}>{s}</Txt>;

  const save = async () => {
    if (nameAr.trim().length < 3) {
      haptic.warn();
      return toast(t('required'), 'error');
    }
    setBusy(true);
    try {
      await api.updateTournament(tour.id, {
        nameAr: nameAr.trim(), nameEn: nameEn.trim(), fee, prize, prize2, rules: rules.trim(), maxTeams, startsOn: toISODate(dateFromOffset(startOff)),
        regDeadline: deadlineOff == null ? null : toISODate(dateFromOffset(Math.min(deadlineOff, startOff))), minPlayers: minP, maxPlayers: Math.max(maxP, minP), slotMinutes: slot,
      });
      await refresh();
      haptic.success();
      toast(t('saved'), 'success');
      router.back();
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('editTournament')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <Field label={t('tournamentName')} value={nameAr} onChangeText={setNameAr} />
        <Field label={t('nameEnOptional')} value={nameEn} onChangeText={setNameEn} autoCapitalize="words" />
        <Row gap={space.md}>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('startDate'))}
            <Stepper value={startOff} onChange={setStartOff} min={1} max={180} format={day} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {label(t('teamsCountLabel'))}
            <Stepper value={maxTeams} onChange={setMaxTeams} min={3} max={32} />
          </View>
        </Row>
        <View style={{ gap: 6 }}>
          {label(t('regDeadline'))}
          <Row gap={8} wrap>
            <Chip label={t('noDeadline')} selected={deadlineOff == null} onPress={() => setDeadlineOff(null)} />
            <Chip label={t('setDeadline')} selected={deadlineOff != null} onPress={() => setDeadlineOff(Math.max(0, startOff - 2))} />
          </Row>
          {deadlineOff != null && <Stepper value={deadlineOff} onChange={(v) => setDeadlineOff(Math.min(v, startOff))} min={0} max={startOff} format={day} />}
        </View>
        <View style={{ gap: 6 }}>
          {label(t('matchLength'))}
          <Row gap={8}>
            {[60, 90, 120].map((m) => (
              <Chip key={m} label={t('minutes', { n: m })} selected={slot === m} onPress={() => setSlot(m)} />
            ))}
          </Row>
        </View>
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
        <Field label={t('rulesOptional')} value={rules} onChangeText={setRules} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
        <Txt v="caption" color={colors.textMuted}>{t('editTournamentHint')}</Txt>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={t('save')} icon="checkmark-circle" loading={busy} onPress={save} />
      </View>
    </View>
  );
}
