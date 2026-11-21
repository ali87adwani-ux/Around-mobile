/** Thumbnail strip; tapping opens a swipeable full-screen viewer. */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import { colors, radius, space } from '@/theme';
import { Tap } from './ui';

export function PhotoGallery({ photos }: { photos: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const { width, height } = useWindowDimensions();
  if (photos.length < 2) return null;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {photos.map((p, i) => (
          <Tap key={p} onPress={() => setOpen(i)} scale={0.97}>
            <Image source={{ uri: p }} style={{ width: 132, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }} />
          </Tap>
        ))}
      </ScrollView>
      <Modal visible={open != null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: (open ?? 0) * width, y: 0 }}>
            {photos.map((p) => (
              <Image key={p} source={{ uri: p }} style={{ width, height: height * 0.7 }} resizeMode="contain" />
            ))}
          </ScrollView>
          <Tap onPress={() => setOpen(null)} style={{ position: 'absolute', top: 54, right: 20, padding: 8 }} hitSlop={12}>
            <Ionicons name="close" size={30} color="#fff" />
          </Tap>
        </View>
      </Modal>
    </>
  );
}
