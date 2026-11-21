import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';
import type { Player } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';
import { Avatar, Row, Txt } from './ui';

export function PlayerCard({ player, displayName }: { player: Player; displayName?: string }) {
  const { t, l } = useApp();
  const s = player.stats;
  const items: [string | number, string][] = [
    [s.matches, t('matchesPlayed')],
    [s.goals, t('goals')],
    [s.assists, t('assists')],
    [s.mvp, t('mvp')],
  ];
  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark, colors.primaryDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: space.xl, gap: space.xl, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 28, borderColor: 'rgba(124,192,245,0.08)', top: -70, right: -60 }} />
      <Row gap={space.lg}>
        <Avatar name={displayName ?? l(player.name)} color={player.id === 'me' ? colors.accentDark : player.color} size={68} ring />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h1" color={colors.white} numberOfLines={1}>
            {displayName ?? l(player.name)}
          </Txt>
          <Txt v="caption" color="rgba(255,255,255,0.8)">
            {t(`pos_${player.position}`)} · {t(`level_${player.level}`)}
          </Txt>
        </View>
        <View style={{ alignItems: 'center', backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Txt v="h2" color={colors.primaryDark} center>
            {s.rating.toFixed(1)}
          </Txt>
          <Txt v="tiny" color={colors.primaryDark} center>
            {t('rating')}
          </Txt>
        </View>
      </Row>
      <Row>
        {items.map(([v, label]) => (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <Txt v="h2" color={colors.white} center>
              {v}
            </Txt>
            <Txt v="tiny" color="rgba(255,255,255,0.7)" center>
              {label}
            </Txt>
          </View>
        ))}
      </Row>
    </LinearGradient>
  );
}
