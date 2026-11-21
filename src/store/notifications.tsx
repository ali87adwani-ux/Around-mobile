/**
 * Notification inbox. Live mode reads public.notifications (written by database triggers) and
 * listens for new rows in real time; tapping a phone push opens the related screen.
 * Demo mode shows a few sample notifications kept on the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { AppNotification } from '@/data/types';
import * as api from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useApp } from './AppStore';

const DEMO_KEY = 'aldawri.demoNotifications.v1';

const demoSeed = (): AppNotification[] => {
  const now = Date.now();
  return [
    { id: 'n1', kind: 'match_joined', title: { ar: 'لاعب جديد بمباراتك', en: 'New player in your game' }, body: { ar: 'فهد انضم لمباراتك بملعب السالمية', en: 'Fahad joined your game at Salmiya' }, data: { match_id: 'm1' }, read: false, at: now - 20 * 60000 },
    { id: 'n2', kind: 'support_reply', title: { ar: 'رد من الدعم الفني 💬', en: 'Support replied 💬' }, body: { ar: 'استفسار عن الحجز', en: 'Question about my booking' }, data: {}, read: false, at: now - 3 * 3600000 },
    { id: 'n3', kind: 'announcement', title: { ar: 'الدوري 📣', en: 'Al Dawri 📣' }, body: { ar: 'خصم ٢٠٪ على الحجوزات قبل الساعة ٥ من الأحد للأربعاء', en: '20% off bookings before 5 PM, Sunday to Wednesday' }, data: {}, read: true, at: now - 26 * 3600000 },
  ];
};

/** Where a notification leads when tapped. */
export function notificationRoute(n: { kind?: string; data?: Record<string, string> }): string | null {
  const d = n.data ?? {};
  if (n.kind === 'friend_request' || n.kind === 'friend_accepted') return n.kind === 'friend_request' ? '/friends?tab=requests' : `/player/${d.user_id}`;
  if (d.match_code) return `/match/join?code=${d.match_code}`;
  if (d.match_id) return `/match/${d.match_id}`;
  if (n.kind === 'payment_claimed') return '/admin';
  if (d.invite_code) return `/tournament/join?code=${d.invite_code}`;
  if (d.invoice_id) return '/billing';
  if (d.fixture_id) return `/tournament/fixture/${d.fixture_id}`;
  if (d.team_id && d.tournament_id) return `/tournament/team/${d.team_id}?t=${d.tournament_id}`;
  if (d.tournament_id) return n.kind === 'team_registered' || n.kind === 'team_withdrew' || n.kind?.startsWith('tournament_') && n.kind !== 'tournament_finished' && n.kind !== 'tournament_cancelled' ? `/tournament/manage/${d.tournament_id}` : `/tournament/${d.tournament_id}`;
  if (d.ticket_id) return `/support/${d.ticket_id}`;
  if (n.kind === 'booking_new' || n.kind === 'booking_cancelled' || n.kind === 'booking_cancelled_late' || n.kind === 'pitch_approved' || n.kind === 'staff_joined') return '/owner';
  if (n.kind === 'pitch_rejected' || n.kind === 'academy_rejected') return '/listings';
  if (n.kind === 'academy_approved') return '/academy-admin';
  if (n.kind === 'booking_cancelled_by_staff') return '/bookings';
  if (n.kind === 'enrollment_new') return '/academy-admin';
  return null;
}

interface Ctx {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
  open: (n: AppNotification) => void;
  remove: (id: string) => Promise<void>;
}

const NotificationsContext = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { mode, meId, signedIn } = useApp();
  const live = mode === 'live';
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const saveDemo = (next: AppNotification[]) => {
    setItems(next);
    AsyncStorage.setItem(DEMO_KEY, JSON.stringify(next)).catch(() => {});
  };

  const refresh = useCallback(async () => {
    if (!live) {
      const raw = await AsyncStorage.getItem(DEMO_KEY).catch(() => null);
      setItems(raw ? JSON.parse(raw) : demoSeed());
      return;
    }
    if (!signedIn || !meId) return setItems([]);
    setLoading(true);
    try {
      setItems(await api.fetchNotifications());
    } catch {
    } finally {
      setLoading(false);
    }
  }, [live, signedIn, meId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // New rows arrive in real time while the app is open.
  useEffect(() => {
    if (!live || !supabase || !meId) return;
    const channel = supabase
      .channel(`notifications:${meId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${meId}` }, (payload) => {
        const n = api.mapNotification(payload.new as Parameters<typeof api.mapNotification>[0]);
        setItems((cur) => (cur.some((x) => x.id === n.id) ? cur : [n, ...cur]));
      })
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [live, meId]);

  // Tapping a phone push opens the related screen.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = (res.notification.request.content.data ?? {}) as Record<string, string>;
      const to = notificationRoute({ kind: data.kind, data });
      if (to) router.push(to as never);
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      items,
      unread: items.filter((n) => !n.read).length,
      loading,
      refresh,
      markAllRead: async () => {
        if (!items.some((n) => !n.read)) return;
        const next = items.map((n) => ({ ...n, read: true }));
        if (live) {
          setItems(next);
          await api.markNotificationsRead().catch(() => {});
        } else saveDemo(next);
      },
      open: (n) => {
        const next = items.map((x) => (x.id === n.id ? { ...x, read: true } : x));
        if (live) {
          setItems(next);
          if (!n.read) api.markNotificationsRead([n.id]).catch(() => {});
        } else saveDemo(next);
        const to = notificationRoute(n);
        if (to) router.push(to as never);
      },
      remove: async (id) => {
        const next = items.filter((n) => n.id !== id);
        if (live) {
          setItems(next);
          await api.deleteNotification(id).catch(() => {});
        } else saveDemo(next);
      },
    }),
    [items, loading, refresh, live], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
