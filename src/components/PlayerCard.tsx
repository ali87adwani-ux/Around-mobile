import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';
import type { Player } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Row, Tap, Txt } from './ui';

export function PlayerCard({ player, displayName, onEditPhoto }: { player: Player; displayName?: string; onEditPhoto?: () => void }) {
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
        <Tap onPress={onEditPhoto} disabled={!onEditPhoto} haptics={!!onEditPhoto} accessibilityLabel="photo">
          <Avatar name={displayName ?? l(player.name)} color={colors.accentDark} uri={player.avatarUrl} size={68} ring />
          {onEditPhoto && (
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={13} color={colors.primaryDark} />
            </View>
          )}
        </Tap>
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
