import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '@/theme';
import { IconButton, Row, Txt, useDir } from './ui';

export function ScreenHeader({ title, right, transparent, light }: { title?: string; right?: React.ReactNode; transparent?: boolean; light?: boolean }) {
  const insets = useSafeAreaInsets();
  const d = useDir();
  return (
    <View
      style={{
        paddingTop: insets.top + 6,
        paddingHorizontal: space.lg,
        paddingBottom: 10,
        backgroundColor: transparent ? 'transparent' : colors.bg,
        position: transparent ? 'absolute' : 'relative',
        left: 0,
        right: 0,
        zIndex: 10,
      }}
    >
      <Row justify="space-between" gap={space.md}>
        <IconButton
          icon={d.backIcon}
          label="back"
          color={light ? '#0D1B33' : colors.text}
          bg={light ? 'rgba(255,255,255,0.92)' : colors.card}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Txt v="h3" numberOfLines={1} style={{ flex: 1 }} center>
          {title ?? ''}
        </Txt>
        <View style={{ minWidth: 42, alignItems: 'center' }}>{right}</View>
      </Row>
    </View>
  );
}
