/** Notification inbox: bookings, games, support replies, pitch reviews and announcements. */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, EmptyState, IconButton, Row, Txt, type IconName } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { useNotifications } from '@/store/notifications';
import { colors, space } from '@/theme';

const ICONS: Record<string, IconName> = {
  match_joined: 'person-add',
  match_full: 'checkmark-done-circle',
  match_cancelled: 'close-circle',
  waitlist_promoted: 'football',
  booking_new: 'calendar',
  booking_cancelled: 'calendar-clear',
  booking_cancelled_by_staff: 'calendar-clear',
  support_reply: 'chatbubbles',
  pitch_approved: 'checkmark-circle',
  pitch_rejected: 'alert-circle',
  enrollment_new: 'school',
  academy_approved: 'school',
  academy_rejected: 'alert-circle',
  announcement: 'megaphone',
};

function ago(at: number, lang: 'ar' | 'en') {
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-KW' : 'en', { numeric: 'auto' });
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return rtf.format(-Math.round(h / 24), 'day');
}

export default function NotificationsScreen() {
  const { t, l, lang } = useApp();
  const insets = useSafeAreaInsets();
  const { items, loading, refresh, markAllRead, open, remove } = useNotifications();

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('notifications')} right={items.some((n) => !n.read) ? <IconButton icon="checkmark-done" label={t('markAllRead')} onPress={markAllRead} /> : undefined} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {items.length === 0 ? (
          <EmptyState icon="notifications-outline" title={t('noNotifications')} body={t('noNotificationsSub')} />
        ) : (
          items.map((n) => (
            <Card key={n.id} onPress={() => open(n)} style={{ backgroundColor: n.read ? colors.card : colors.primarySoft }}>
              <Row gap={space.md} align="flex-start">
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.read ? colors.surfaceMuted : colors.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICONS[n.kind] ?? 'notifications'} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row justify="space-between" gap={space.sm}>
                    <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {l(n.title)}
                    </Txt>
                    {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
                  </Row>
                  {!!l(n.body) && (
                    <Txt v="caption" color={colors.textMuted}>
                      {l(n.body)}
                    </Txt>
                  )}
                  <Row justify="space-between">
                    <Txt v="tiny" color={colors.textFaint}>
                      {ago(n.at, lang)}
                    </Txt>
                    <IconButton icon="trash-outline" label={t('delete')} size={30} color={colors.textFaint} bg="transparent" onPress={() => remove(n.id)} />
                  </Row>
                </View>
              </Row>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
