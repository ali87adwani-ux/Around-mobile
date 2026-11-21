import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { AcademyCard } from '@/components/academy';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Chip, HScroll, Row, Tap, Txt } from '@/components/ui';
import { router } from 'expo-router';
import { useApp } from '@/store/AppStore';
import { useAcademies } from '@/store/academies';
import { colors, space } from '@/theme';

const GROUPS: [number, number][] = [
  [5, 7],
  [8, 11],
  [12, 15],
  [16, 60],
];

export default function Academies() {
  const { t, l } = useApp();
  const { academies, programs, myEnrollments } = useAcademies();
  const [group, setGroup] = useState<[number, number] | null>(null);

  const list = useMemo(
    () => academies.filter((a) => !group || programs.some((p) => p.academyId === a.id && p.ageMin <= group[1] && p.ageMax >= group[0])),
    [academies, programs, group],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('academies')} />
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Txt v="caption" color={colors.textMuted}>
              {t('academiesSub')}
            </Txt>
            {myEnrollments.length > 0 && (
              <Card style={{ gap: space.sm }}>
                <Txt v="h3">{t('myEnrollments')}</Txt>
                {myEnrollments.map((e) => {
                  const p = programs.find((x) => x.id === e.programId);
                  const a = academies.find((x) => x.id === p?.academyId);
                  if (!p || !a) return null;
                  return (
                    <Tap key={e.id} onPress={() => router.push(`/academy/${a.id}`)} scale={0.99}>
                      <Row justify="space-between" style={{ paddingVertical: 6 }}>
                        <Txt v="bodyStrong">{e.childName}</Txt>
                        <Txt v="caption" color={colors.textMuted}>
                          {l(p.name)} · {l(a.name)}
                        </Txt>
                      </Row>
                    </Tap>
                  );
                })}
              </Card>
            )}
            <View style={{ marginHorizontal: -space.lg }}>
              <HScroll gap={8}>
                <Chip label={t('allAges')} selected={!group} onPress={() => setGroup(null)} />
                {GROUPS.map((g) => (
                  <Chip key={g[0]} label={g[1] >= 60 ? `${g[0]}+` : `${g[0]}–${g[1]}`} selected={group?.[0] === g[0]} onPress={() => setGroup(group?.[0] === g[0] ? null : g)} />
                ))}
              </HScroll>
            </View>
          </View>
        }
        renderItem={({ item }) => <AcademyCard academy={item} programsCount={programs.filter((p) => p.academyId === item.id).length} />}
      />
    </View>
  );
}
