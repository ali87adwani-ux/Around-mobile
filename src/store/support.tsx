/**
 * Technical support tickets. Demo mode keeps tickets on the device (with an instant
 * acknowledgement from "support"); live mode uses the support_* tables.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { useApp, type Result } from './AppStore';

export type TicketCategory = 'booking' | 'payment' | 'account' | 'pitch' | 'academy' | 'other';
export type TicketStatus = 'open' | 'answered' | 'closed';
export interface TicketMessage {
  id: string;
  fromSupport: boolean;
  body: string;
  at: number;
}
export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  createdAt: number;
  updatedAt: number;
  messages: TicketMessage[];
}

interface Ctx {
  tickets: Ticket[]; // mine (or all, for admins)
  loading: boolean;
  reload: () => Promise<void>;
  getTicket: (id: string) => Ticket | undefined;
  openTicket: (p: { category: TicketCategory; subject: string; body: string }) => Promise<Result>;
  sendMessage: (ticketId: string, body: string, asSupport?: boolean) => Promise<Result>;
  setStatus: (ticketId: string, status: TicketStatus) => Promise<Result>;
}

export const ticketStatusStyle: Record<TicketStatus, { color: string; bg: string }> = {
  open: { color: colors.warning, bg: colors.warningSoft },
  answered: { color: colors.success, bg: colors.successSoft },
  closed: { color: colors.textMuted, bg: colors.surfaceMuted },
};

const KEY = 'aldawri.support.v1';
const SupportContext = createContext<Ctx | null>(null);

export function SupportProvider({ children }: { children: React.ReactNode }) {
  const { mode, meId, state, t, role } = useApp();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const live = mode === 'live';

  // demo persistence
  useEffect(() => {
    if (live) return;
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setTickets(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [live]);
  useEffect(() => {
    if (!live && hydrated) AsyncStorage.setItem(KEY, JSON.stringify(tickets)).catch(() => {});
  }, [tickets, live, hydrated]);

  const reload = useCallback(async () => {
    if (!live || !supabase || !meId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, profiles(name), support_messages(*)')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setTickets(
        (data ?? []).map((r: Record<string, any>) => ({
          id: r.id,
          userId: r.user_id,
          userName: r.profiles?.name ?? '',
          category: r.category,
          subject: r.subject,
          status: r.status,
          createdAt: Date.parse(r.created_at),
          updatedAt: Date.parse(r.updated_at),
          messages: (r.support_messages ?? [])
            .map((m: Record<string, any>) => ({ id: m.id, fromSupport: m.from_support, body: m.body, at: Date.parse(m.created_at) }))
            .sort((a: TicketMessage, b: TicketMessage) => a.at - b.at),
        })),
      );
    } catch {
    } finally {
      setLoading(false);
    }
  }, [live, meId]);

  useEffect(() => {
    reload();
  }, [reload, role]);

  const value = useMemo<Ctx>(() => {
    const touch = (id: string, fn: (tk: Ticket) => Ticket) => setTickets((all) => all.map((tk) => (tk.id === id ? fn(tk) : tk)).sort((a, b) => b.updatedAt - a.updatedAt));
    return {
      tickets,
      loading,
      reload,
      getTicket: (id) => tickets.find((tk) => tk.id === id),
      openTicket: async ({ category, subject, body }) => {
        try {
          if (live && supabase) {
            const { data, error } = await supabase.from('support_tickets').insert({ user_id: meId, category, subject }).select().single();
            if (error) throw error;
            const { error: e2 } = await supabase.from('support_messages').insert({ ticket_id: data.id, author_id: meId, body });
            if (e2) throw e2;
            await reload();
            return { ok: true, id: data.id };
          }
          const now = Date.now();
          const tk: Ticket = {
            id: `tk${now}`,
            userId: meId,
            userName: state.profile.name,
            category,
            subject,
            status: 'answered',
            createdAt: now,
            updatedAt: now,
            messages: [
              { id: `m${now}`, fromSupport: false, body, at: now },
              { id: `m${now + 1}`, fromSupport: true, body: t('supportAutoReply'), at: now + 1 },
            ],
          };
          setTickets((all) => [tk, ...all]);
          return { ok: true, id: tk.id };
        } catch (e) {
          return { ok: false, error: 'unknown' };
        }
      },
      sendMessage: async (ticketId, body, asSupport = false) => {
        try {
          if (live && supabase) {
            const { error } = await supabase.from('support_messages').insert({ ticket_id: ticketId, author_id: meId, body, from_support: asSupport });
            if (error) throw error;
            await reload();
            return { ok: true };
          }
          const now = Date.now();
          touch(ticketId, (tk) => ({ ...tk, status: asSupport ? 'answered' : 'open', updatedAt: now, messages: [...tk.messages, { id: `m${now}`, fromSupport: asSupport, body, at: now }] }));
          return { ok: true };
        } catch {
          return { ok: false, error: 'unknown' };
        }
      },
      setStatus: async (ticketId, status) => {
        try {
          if (live && supabase) {
            const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
            if (error) throw error;
            await reload();
            return { ok: true };
          }
          touch(ticketId, (tk) => ({ ...tk, status, updatedAt: Date.now() }));
          return { ok: true };
        } catch {
          return { ok: false, error: 'unknown' };
        }
      },
    };
  }, [tickets, loading, reload, live, meId, state.profile.name, t]);

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export function useSupport() {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error('useSupport must be used inside SupportProvider');
  return ctx;
}
