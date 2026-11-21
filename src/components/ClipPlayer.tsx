/** Goal clip: video player, like, download to the phone (or browser), delete for the organiser. */
import { Ionicons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import type { Highlight } from '@/data/types';
import { useApp } from '@/store/AppStore';
import { colors, radius, space } from '@/theme';
import { useToast } from './overlays';
import { Card, IconButton, Row, Txt } from './ui';

export async function downloadClip(url: string): Promise<'saved' | 'opened'> {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = url;
    a.download = url.split('/').pop() ?? 'clip.mp4';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'opened';
  }
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    await Linking.openURL(url);
    return 'opened';
  }
  const file = await File.downloadFileAsync(url, new Directory(Paths.cache), { idempotent: true });
  await MediaLibrary.saveToLibraryAsync(file.uri);
  return 'saved';
}

export function ClipPlayer({ clip, title, liked, onLike, onDelete, expiresInDays }: { clip: Highlight; title: string; liked: boolean; onLike: () => void; onDelete?: () => void; expiresInDays?: number }) {
  const { t } = useApp();
  const toast = useToast();
  const player = useVideoPlayer(clip.url, (p) => {
    p.loop = false;
  });
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const r = await downloadClip(clip.url);
      toast(r === 'saved' ? t('clipSaved') : t('clipOpened'), 'success');
    } catch {
      toast(t('err_unknown'), 'error');
    }
    setBusy(false);
  };

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ aspectRatio: 16 / 9, backgroundColor: '#000' }}>
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
      </View>
      <Row gap={space.sm} style={{ padding: space.md }}>
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong" numberOfLines={1}>
            {title}
          </Txt>
          {expiresInDays != null && (
            <Txt v="tiny" color={colors.warning}>
              {t('clipExpires', { n: expiresInDays })}
            </Txt>
          )}
        </View>
        <IconButton icon={liked ? 'heart' : 'heart-outline'} label={t('like')} size={36} color={colors.danger} bg={colors.dangerSoft} onPress={onLike} />
        <Txt v="label" style={{ minWidth: 18 }}>
          {clip.likes}
        </Txt>
        <IconButton icon={busy ? 'hourglass-outline' : 'download-outline'} label={t('download')} size={36} color={colors.primary} bg={colors.primarySoft} onPress={busy ? undefined : download} />
        {onDelete && <IconButton icon="trash-outline" label={t('delete')} size={36} color={colors.textMuted} bg={colors.surfaceMuted} onPress={onDelete} />}
      </Row>
    </Card>
  );
}

export const clipRadius = radius.lg;
