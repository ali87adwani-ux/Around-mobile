import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgramCard, Stepper } from '@/components/academy';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, EmptyState, Field, PitchArt, Row, Txt, haptic } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { useAcademies, type Program } from '@/store/academies';
import { colors, radius, space } from '@/theme';

export default function AcademyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, l, errText } = useApp();
  const { academies, programs, myEnrollments, enroll, cancelEnrollment } = useAcademies();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const academy = academies.find((a) => a.id === id);
  const [target, setTarget] = useState<Program | null>(null);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState(8);
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  if (!academy) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader />
        <EmptyState icon="school-outline" title={t('noResults')} />
      </View>
    );
  }
  const list = programs.filter((p) => p.academyId === academy.id);
  const mine = myEnrollments.filter((e) => list.some((p) => p.id === e.programId));

  const openEnroll = (p: Program) => {
    setTarget(p);
    setChildAge(Math.round((p.ageMin + p.ageMax) / 2));
  };

  const submit = async () => {
    if (!target || childName.trim().length < 2) return;
    setSaving(true);
    const r = await enroll(target.id, childName.trim(), childAge);
    setSaving(false);
    if (!r.ok) return toast(errText(r.error), 'error');
    haptic.success();
    setTarget(null);
    setChildName('');
    toast(t('enrolledToast'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <ScreenHeader transparent light />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <PitchArt tint={academy.tint} height={220 + insets.top} radiusSize={0}>
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, paddingBottom: space.xxl, gap: 4 }}>
            <Txt v="display" color={colors.white}>
              {l(academy.name)}
            </Txt>
            <Row gap={6}>
              <Ionicons name="location" size={14} color={colors.accent} />
              <Txt v="caption" color="rgba(255,255,255,0.85)">
                {l(academy.area)}
              </Txt>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Txt v="caption" color="rgba(255,255,255,0.85)">
                {academy.rating.toFixed(1)}
              </Txt>
            </Row>
          </View>
        </PitchArt>
        <View style={{ marginTop: -space.xl, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.lg }}>
          <Txt v="body" color={colors.textMuted}>
            {l(academy.about)}
          </Txt>
          {mine.length > 0 && (
            <Card style={{ gap: space.sm, backgroundColor: colors.primarySoft }} flat>
              <Txt v="h3">{t('myEnrollments')}</Txt>
              {mine.map((e) => (
                <Row key={e.id} justify="space-between">
                  <Txt v="bodyStrong">
                    {e.childName} · {l(list.find((p) => p.id === e.programId)!.name)}
                  </Txt>
                  <Button title={t('unenroll')} small kind="danger" onPress={() => setCancelId(e.id)} />
                </Row>
              ))}
            </Card>
          )}
          <Txt v="h2">{t('programs')}</Txt>
          {list.map((p) => (
            <ProgramCard key={p.id} program={p} onEnroll={() => openEnroll(p)} />
          ))}
        </View>
      </ScrollView>

      <Sheet visible={!!target} onClose={() => setTarget(null)} title={t('enrollChild')}>
        {target && (
          <View style={{ gap: space.lg }}>
            <Txt v="caption" color={colors.textMuted}>
              {l(target.name)} · {t('ages', { min: target.ageMin, max: target.ageMax })}
            </Txt>
            <Field label={t('childName')} placeholder={t('childNamePlaceholder')} value={childName} onChangeText={setChildName} autoFocus maxLength={60} />
            <View style={{ gap: 6 }}>
              <Txt v="label" color={colors.textMuted}>
                {t('childAge')}
              </Txt>
              <Stepper value={childAge} onChange={setChildAge} min={3} max={60} />
              {(childAge < target.ageMin || childAge > target.ageMax) && (
                <Txt v="tiny" color={colors.danger}>
                  {errText('age_out_of_range')}
                </Txt>
              )}
            </View>
            <Button title={t('confirm')} icon="checkmark-circle" loading={saving} disabled={childName.trim().length < 2 || childAge < target.ageMin || childAge > target.ageMax} onPress={submit} />
          </View>
        )}
      </Sheet>

      <ConfirmSheet
        visible={!!cancelId}
        onClose={() => setCancelId(null)}
        title={t('unenrollConfirm')}
        confirmLabel={t('unenroll')}
        cancelLabel={t('back')}
        danger
        onConfirm={async () => {
          const eid = cancelId!;
          setCancelId(null);
          const r = await cancelEnrollment(eid);
          toast(r.ok ? t('unenrolledToast') : errText(r.error), r.ok ? 'info' : 'error');
        }}
      />
    </View>
  );
}
