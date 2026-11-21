import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { daysLabel, formatDuration, formatHour } from '@/i18n/format';
import { useApp } from '@/store/AppStore';
import type { Academy, Program } from '@/store/academies';
import { colors, radius, space } from '@/theme';
import { LevelBadge } from './cards';
import { Badge, Button, Card, PitchArt, Progress, Row, Txt } from './ui';

export function AcademyCard({ academy, programsCount, compact }: { academy: Academy; programsCount: number; compact?: boolean }) {
  const { l, t } = useApp();
  return (
    <Card onPress={() => router.push(`/academy/${academy.id}`)} style={{ padding: 0, overflow: 'hidden', width: compact ? 260 : undefined }}>
      <PitchArt tint={academy.tint} photo={academy.photos?.[0]} height={compact ? 96 : 112} radiusSize={0}>
        <Row justify="space-between" align="flex-start" style={{ padding: space.md, flex: 1 }}>
          <Badge label={`${programsCount} ${t('programs')}`} color={colors.white} bg="rgba(0,0,0,0.28)" icon="school" />
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school" size={22} color={colors.accent} />
          </View>
        </Row>
      </PitchArt>
      <View style={{ padding: space.md, gap: 2 }}>
        <Row justify="space-between" gap={8}>
          <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
            {l(academy.name)}
          </Txt>
          <Row gap={3}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Txt v="label">{academy.rating.toFixed(1)}</Txt>
          </Row>
        </Row>
        <Row gap={4}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Txt v="caption" color={colors.textMuted} numberOfLines={1}>
            {l(academy.area)}
          </Txt>
        </Row>
      </View>
    </Card>
  );
}

export function ProgramCard({ program, onEnroll, footer }: { program: Program; onEnroll?: () => void; footer?: React.ReactNode }) {
  const { l, t, lang, money } = useApp();
  const left = program.capacity - program.enrolled;
  return (
    <Card style={{ gap: space.md }}>
      <Row justify="space-between" align="flex-start" gap={space.md}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="h3">{l(program.name)}</Txt>
          <Row gap={6} wrap>
            <Badge label={t('ages', { min: program.ageMin, max: program.ageMax })} icon="people-outline" />
            <LevelBadge level={program.level} />
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="h3" color={colors.primary}>
            {money(program.monthlyFee)}
          </Txt>
          <Txt v="tiny" color={colors.textMuted}>
            {t('perMonth')}
          </Txt>
        </View>
      </Row>
      <View style={{ gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Txt v="caption" style={{ flex: 1 }}>
            {daysLabel(program.days, lang)}
          </Txt>
        </Row>
        <Row gap={8}>
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Txt v="caption">
            {formatHour(program.startHour, lang)} · {formatDuration(program.duration, lang)}
          </Txt>
        </Row>
        <Row gap={8}>
          <Ionicons name="person-outline" size={16} color={colors.primary} />
          <Txt v="caption">{l(program.coach)}</Txt>
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <Row justify="space-between">
          <Txt v="tiny" color={colors.textMuted}>
            {program.enrolled}/{program.capacity}
          </Txt>
          <Txt v="tiny" color={left <= 3 && left > 0 ? colors.danger : left === 0 ? colors.textMuted : colors.success}>
            {left > 0 ? t('seatsLeft', { n: left }) : t('full')}
          </Txt>
        </Row>
        <Progress value={program.enrolled / program.capacity} color={left === 0 ? colors.textFaint : colors.primary} />
      </View>
      {onEnroll && <Button title={left > 0 ? t('enrollChild') : t('full')} small icon="person-add" disabled={left <= 0} onPress={onEnroll} />}
      {footer}
    </Card>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  return (
    <Row gap={space.sm} style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4 }}>
      <Button title="−" small kind="secondary" onPress={() => onChange(Math.max(min, +(value - step).toFixed(3)))} style={{ width: 44, paddingHorizontal: 0 }} />
      <Txt v="bodyStrong" center numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1 }}>
        {format ? format(value) : value}
      </Txt>
      <Button title="+" small kind="secondary" onPress={() => onChange(Math.min(max, +(value + step).toFixed(3)))} style={{ width: 44, paddingHorizontal: 0 }} />
    </Row>
  );
}
