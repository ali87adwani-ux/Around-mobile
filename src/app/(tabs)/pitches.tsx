import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PitchCard } from '@/components/cards';
import { Chip, EmptyState, HScroll, Row, Tap, Txt, webNoOutline } from '@/components/ui';
import type { PitchSize } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, fonts, radius, space } from '@/theme';

type Sort = 'nearest' | 'cheapest' | 'top';

export default function Pitches() {
  const { t, l, pitches, isRTL, state } = useApp();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('nearest');
  const [size, setSize] = useState<PitchSize | null>(null);
  const [indoor, setIndoor] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    let r = pitches.filter((p) => {
      if (size && !p.sizes.includes(size)) return false;
      if (indoor && !p.indoor) return false;
      if (favOnly && !state.favorites.includes(p.id)) return false;
      if (!query) return true;
      return [p.name.ar, p.name.en, p.area.ar, p.area.en].some((s) => s.toLowerCase().includes(query));
    });
    r = [...r].sort((a, b) => (sort === 'nearest' ? a.distanceKm - b.distanceKm : sort === 'cheapest' ? a.pricePerHour - b.pricePerHour : b.rating - a.rating));
    return r;
  }, [q, sort, size, indoor, favOnly, pitches, state.favorites]);

  const hasFilters = !!q || !!size || indoor || favOnly;
  const clear = () => {
    setQ('');
    setSize(null);
    setIndoor(false);
    setFavOnly(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + space.md, gap: space.md, paddingBottom: space.sm }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Txt v="h1">{t('tabPitches')}</Txt>
          <Row gap={8} style={{ backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: space.md, height: 50, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t('search')}
              placeholderTextColor={colors.textFaint}
              returnKeyType="search"
              style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text, textAlign: isRTL ? 'right' : 'left', height: '100%', ...webNoOutline }}
            />
            {!!q && (
              <Tap onPress={() => setQ('')} hitSlop={10} accessibilityLabel="clear">
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </Tap>
            )}
          </Row>
        </View>
        <HScroll gap={8}>
          <Chip label={t('sortNearest')} icon="navigate-outline" selected={sort === 'nearest'} onPress={() => setSort('nearest')} />
          <Chip label={t('sortCheapest')} icon="pricetag-outline" selected={sort === 'cheapest'} onPress={() => setSort('cheapest')} />
          <Chip label={t('sortTop')} icon="star-outline" selected={sort === 'top'} onPress={() => setSort('top')} />
          <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 6 }} />
          <Chip label={t('favorite')} icon="heart-outline" selected={favOnly} onPress={() => setFavOnly(!favOnly)} />
          {([5, 7, 11] as PitchSize[]).map((s) => (
            <Chip key={s} label={`${s}×${s}`} selected={size === s} onPress={() => setSize(size === s ? null : s)} />
          ))}
          <Chip label={t('indoor')} icon="home-outline" selected={indoor} onPress={() => setIndoor(!indoor)} />
        </HScroll>
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PitchCard pitch={item} />}
        contentContainerStyle={{ padding: space.lg, paddingTop: space.xs, gap: space.lg }}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<EmptyState icon="search-outline" title={t('noResults')} body={t('noResultsSub')} action={hasFilters ? t('clearFilters') : undefined} onAction={clear} />}
      />
    </View>
  );
}
