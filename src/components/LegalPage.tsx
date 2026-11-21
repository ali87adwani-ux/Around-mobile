import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEGAL_UPDATED, privacy, terms } from '@/i18n/legal';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';
import { ScreenHeader } from './ScreenHeader';
import { Row, Txt } from './ui';

export function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const { lang, t } = useApp();
  const insets = useSafeAreaInsets();
  const d = (doc === 'privacy' ? privacy : terms)[lang];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={d.title} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 6 }}>
          <Txt v="display">{d.title}</Txt>
          <Txt v="caption" color={colors.textFaint}>
            {t('lastUpdated', { date: LEGAL_UPDATED })}
          </Txt>
          <Txt v="body" color={colors.textMuted}>
            {d.intro}
          </Txt>
        </View>
        {d.sections.map((s) => (
          <View key={s.h} style={{ gap: space.sm }}>
            <Txt v="h3">{s.h}</Txt>
            {s.p.map((p, i) => (
              <Row key={i} gap={8} align="flex-start">
                {s.p.length > 1 && <Txt v="body" color={colors.primary}>•</Txt>}
                <Txt v="body" color={colors.textMuted} style={{ flex: 1 }}>
                  {p}
                </Txt>
              </Row>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
