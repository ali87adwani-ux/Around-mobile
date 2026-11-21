import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ProgramCard, Stepper } from '@/components/academy';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { IconButton, Badge, Button, Card, Chip, Divider, EmptyState, Field, HScroll, Row, Stat, Tap, Txt } from '@/components/ui';
import type { Level } from '@/data/types';
import { dayLabel, formatDuration, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import * as api from '@/lib/api';
import { toISODate } from '@/i18n/format';
import { useAcademies, type Program, type ProgramInput } from '@/store/academies';
import { colors, space } from '@/theme';

const emptyProgram = (): ProgramInput => ({
  name: { ar: '', en: '' },
  coach: { ar: '', en: '' },
  ageMin: 8,
  ageMax: 11,
  level: 'beginner',
  days: [0, 2],
  startHour: 17,
  duration: 1.5,
  monthlyFee: 30,
  capacity: 20,
});

export default function AcademyAdmin() {
  const { t, l, lang, money, errText, mode } = useApp();
  const { ownedAcademies, programs, managedEnrollments, saveProgram, deleteProgram, cancelEnrollment } = useAcademies();
  const toast = useToast();
  const [academyId, setAcademyId] = useState(ownedAcademies[0]?.id);
  const academy = ownedAcademies.find((a) => a.id === academyId) ?? ownedAcademies[0];
  // Monthly fee and today's attendance per child (live mode).
  const todayISO = toISODate(new Date());
  const monthISO = `${todayISO.slice(0, 7)}-01`;
  const [track, setTrack] = useState<{ paid: Set<string>; present: Map<string, boolean> }>({ paid: new Set(), present: new Map() });
  const loadTrack = useCallback(() => {
    if (mode !== 'live') return;
    api.academyTracking(managedEnrollments.map((e) => e.id), monthISO, todayISO).then(setTrack).catch(() => {});
  }, [mode, managedEnrollments, monthISO, todayISO]);
  useEffect(loadTrack, [loadTrack]);
  const [form, setForm] = useState<{ id?: string; p: ProgramInput } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openRoster, setOpenRoster] = useState<string | null>(null);

  if (!academy) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('academyDashboard')} right={<IconButton icon="card-outline" label={t('billingTitle')} onPress={() => router.push('/billing')} />} />
        <EmptyState icon="school-outline" title={t('noAcademy')} body={t('noAcademySub')} action={t('listAcademy')} onAction={() => router.push('/listings')} />
      </View>
    );
  }

  const mine = programs.filter((p) => p.academyId === academy.id);
  const students = mine.reduce((s, p) => s + p.enrolled, 0);
  const capacity = mine.reduce((s, p) => s + p.capacity, 0);
  const revenue = mine.reduce((s, p) => s + p.enrolled * p.monthlyFee, 0);

  const set = (patch: Partial<ProgramInput>) => setForm((f) => (f ? { ...f, p: { ...f.p, ...patch } } : f));
  const edit = (p: Program) =>
    setForm({ id: p.id, p: { name: p.name, coach: p.coach, ageMin: p.ageMin, ageMax: p.ageMax, level: p.level, days: p.days, startHour: p.startHour, duration: p.duration, monthlyFee: p.monthlyFee, capacity: p.capacity } });

  const submit = async () => {
    if (!form || !form.p.name.ar.trim() || !form.p.days.length) return;
    setSaving(true);
    const r = await saveProgram(academy.id, form.p, form.id);
    setSaving(false);
    if (!r.ok) return toast(errText(r.error), 'error');
    setForm(null);
    toast(t('programSaved'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('academyDashboard')} right={<IconButton icon="card-outline" label={t('billingTitle')} onPress={() => router.push('/billing')} />} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        {mode === 'demo' && <Badge label={t('demoMode')} icon="information-circle" color={colors.info} bg={colors.infoSoft} />}
        {ownedAcademies.length > 1 && (
          <Row gap={8} wrap>
            {ownedAcademies.map((a) => (
              <Chip key={a.id} label={l(a.name)} selected={a.id === academy.id} onPress={() => setAcademyId(a.id)} />
            ))}
          </Row>
        )}
        <Row justify="space-between" gap={space.sm}>
          <Txt v="h1" style={{ flex: 1 }}>{l(academy.name)}</Txt>
          <Button title={t('edit')} small kind="secondary" icon="create-outline" onPress={() => router.push(`/listing/edit/academy/${academy.id}`)} />
        </Row>

        <Card>
          <Row>
            <Stat icon="people" value={students} label={t('students')} />
            <Stat icon="cash" value={money(revenue)} label={t('monthlyRevenue')} color={colors.success} />
            <Stat icon="pie-chart" value={`${capacity ? Math.round((students / capacity) * 100) : 0}%`} label={t('fillRate')} color={colors.info} />
          </Row>
        </Card>

        <Row justify="space-between">
          <Txt v="h2">{t('programs')}</Txt>
          <Button title={t('addProgram')} small icon="add" onPress={() => setForm({ p: emptyProgram() })} />
        </Row>

        {mine.map((p) => {
          const roster = managedEnrollments.filter((e) => e.programId === p.id);
          const isOpen = openRoster === p.id;
          return (
            <ProgramCard
              key={p.id}
              program={p}
              footer={
                <View style={{ gap: space.sm }}>
                  <Row gap={space.sm}>
                    <Button title={t('editProgram')} small kind="secondary" icon="create-outline" onPress={() => edit(p)} style={{ flex: 1 }} />
                    <Button title={`${t('roster')} (${roster.length})`} small kind="ghost" icon={isOpen ? 'chevron-up' : 'chevron-down'} onPress={() => setOpenRoster(isOpen ? null : p.id)} style={{ flex: 1 }} />
                  </Row>
                  {isOpen && (
                    <View>
                      {roster.length === 0 ? (
                        <Txt v="caption" color={colors.textMuted} center style={{ paddingVertical: space.md }}>
                          {t('noStudents')}
                        </Txt>
                      ) : (
                        roster.map((e, i) => (
                          <View key={e.id}>
                            <Row justify="space-between" style={{ paddingVertical: 10 }}>
                              <Row gap={8} style={{ flex: 1 }}>
                                <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
                                <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{e.childName}</Txt>
                                <Txt v="caption" color={colors.textMuted}>
                                  {e.childAge}
                                </Txt>
                              </Row>
                              {mode === 'live' && !e.id.startsWith('demo-') && (
                                <Row gap={6} style={{ marginHorizontal: 6 }}>
                                  <Chip
                                    label={track.paid.has(e.id) ? `✓ ${t('feeThisMonth')}` : t('feeThisMonth')}
                                    icon="cash-outline"
                                    selected={track.paid.has(e.id)}
                                    onPress={async () => {
                                      try {
                                        await api.academyMarkPaid(e.id, monthISO, !track.paid.has(e.id));
                                        loadTrack();
                                      } catch (err) {
                                        toast(errText(api.errorCode(err)), 'error');
                                      }
                                    }}
                                  />
                                  <Chip
                                    label={track.present.get(e.id) === true ? `✓ ${t('presentToday')}` : track.present.get(e.id) === false ? `✗ ${t('absentToday')}` : t('attendance')}
                                    icon="calendar-outline"
                                    selected={track.present.get(e.id) === true}
                                    onPress={async () => {
                                      const cur = track.present.get(e.id);
                                      const next = cur === undefined ? true : cur === true ? false : null;
                                      try {
                                        await api.academyMarkAttendance(e.id, todayISO, next);
                                        loadTrack();
                                      } catch (err) {
                                        toast(errText(api.errorCode(err)), 'error');
                                      }
                                    }}
                                  />
                                </Row>
                              )}
                              <Tap
                                onPress={async () => {
                                  const r = await cancelEnrollment(e.id);
                                  toast(r.ok ? t('studentRemoved') : errText(r.error), r.ok ? 'info' : 'error');
                                }}
                                hitSlop={8}
                              >
                                <Txt v="label" color={colors.danger}>
                                  {t('removeStudent')}
                                </Txt>
                              </Tap>
                            </Row>
                            {i < roster.length - 1 && <Divider />}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              }
            />
          );
        })}
      </ScrollView>

      <Sheet visible={!!form} onClose={() => setForm(null)} title={form?.id ? t('editProgram') : t('addProgram')}>
        {form && (
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
            <Field label={t('programName')} placeholder={t('programNamePlaceholder')} value={form.p.name.ar} onChangeText={(v) => set({ name: { ar: v, en: v } })} />
            <Field label={t('coachName')} value={form.p.coach.ar} onChangeText={(v) => set({ coach: { ar: v, en: v } })} />
            <Row gap={space.md}>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt v="label" color={colors.textMuted}>{t('minAge')}</Txt>
                <Stepper value={form.p.ageMin} onChange={(v) => set({ ageMin: v, ageMax: Math.max(v, form.p.ageMax) })} min={3} max={60} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt v="label" color={colors.textMuted}>{t('maxAge')}</Txt>
                <Stepper value={form.p.ageMax} onChange={(v) => set({ ageMax: Math.max(v, form.p.ageMin) })} min={3} max={60} />
              </View>
            </Row>
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('level')}</Txt>
              <Row gap={8} wrap>
                {(['beginner', 'intermediate', 'advanced'] as Level[]).map((lv) => (
                  <Chip key={lv} label={t(`level_${lv}`)} selected={form.p.level === lv} onPress={() => set({ level: lv })} />
                ))}
              </Row>
            </View>
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('days')}</Txt>
              <Row gap={6} wrap>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const on = form.p.days.includes(d);
                  return <Chip key={d} label={dayLabel(d, lang)} selected={on} onPress={() => set({ days: on ? form.p.days.filter((x) => x !== d) : [...form.p.days, d].sort() })} />;
                })}
              </Row>
            </View>
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('startTime')}</Txt>
              <View style={{ marginHorizontal: -space.xl }}>
                <HScroll gap={6} padding={space.xl}>
                  {[8, 9, 10, 15, 16, 16.5, 17, 17.5, 18, 18.5, 19, 20, 21].map((h) => (
                    <Chip key={h} label={formatHour(h, lang)} selected={form.p.startHour === h} onPress={() => set({ startHour: h })} />
                  ))}
                </HScroll>
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>{t('duration')}</Txt>
              <Row gap={8}>
                {[1, 1.5, 2].map((dur) => (
                  <Chip key={dur} label={formatDuration(dur, lang)} selected={form.p.duration === dur} onPress={() => set({ duration: dur })} />
                ))}
              </Row>
            </View>
            <Row gap={space.md}>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt v="label" color={colors.textMuted}>{t('monthlyFee')}</Txt>
                <Stepper value={form.p.monthlyFee} onChange={(v) => set({ monthlyFee: v })} min={0} max={500} step={5} format={money} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt v="label" color={colors.textMuted}>{t('capacity')}</Txt>
                <Stepper value={form.p.capacity} onChange={(v) => set({ capacity: v })} min={1} max={200} />
              </View>
            </Row>
            <Button title={t('save')} icon="checkmark-circle" loading={saving} disabled={!form.p.name.ar.trim() || !form.p.days.length} onPress={submit} />
            {form.id && <Button title={t('deleteProgram')} kind="danger" icon="trash" onPress={() => setDeleteId(form.id!)} />}
          </ScrollView>
        )}
      </Sheet>

      <ConfirmSheet
        visible={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={t('deleteProgramConfirm')}
        confirmLabel={t('deleteProgram')}
        cancelLabel={t('back')}
        danger
        onConfirm={async () => {
          const pid = deleteId!;
          setDeleteId(null);
          setForm(null);
          const r = await deleteProgram(pid);
          toast(r.ok ? t('programDeleted') : errText(r.error), r.ok ? 'info' : 'error');
        }}
      />
    </View>
  );
}
