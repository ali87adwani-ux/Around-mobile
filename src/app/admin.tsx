import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { ScrollView, TextInput, View } from 'react-native';
import { Stepper } from '@/components/academy';
import { statusBadge } from '@/components/cards';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Badge, Button, Card, Chip, Divider, EmptyState, HScroll, IconButton, Row, Tap, Txt, useDir, webNoOutline, type IconName } from '@/components/ui';
import type { DuesRow, PendingPitch, Tournament } from '@/data/types';
import * as api from '@/lib/api';
import { ME_ID } from '@/data/seed';
import { formatDay, formatHour, fromISODate } from '@/i18n/format';
import type { StringKey } from '@/i18n/strings';
import { fmtDate, invoiceBadge, subStatusBadge } from '@/components/billing';
import { useAcademies } from '@/store/academies';
import { useAdmin, type Role } from '@/store/admin';
import { useApp } from '@/store/AppStore';
import { ticketStatusStyle, useSupport, type TicketStatus } from '@/store/support';
import { colors, fonts, radius, space } from '@/theme';

type Tab = 'overview' | 'users' | 'pitches' | 'bookings' | 'tournaments' | 'billing' | 'dues' | 'academies' | 'support' | 'announcements';
const TABS: { key: Tab; label: StringKey; icon: IconName }[] = [
  { key: 'overview', label: 'adminOverview', icon: 'speedometer-outline' },
  { key: 'users', label: 'adminUsers', icon: 'people-outline' },
  { key: 'pitches', label: 'adminPitches', icon: 'football-outline' },
  { key: 'bookings', label: 'adminBookings', icon: 'calendar-outline' },
  { key: 'tournaments', label: 'adminTournaments', icon: 'trophy-outline' },
  { key: 'billing', label: 'subscriptionsTab', icon: 'card-outline' },
  { key: 'dues', label: 'duesTab', icon: 'cash-outline' },
  { key: 'academies', label: 'adminAcademies', icon: 'school-outline' },
  { key: 'support', label: 'adminSupport', icon: 'headset-outline' },
  { key: 'announcements', label: 'adminAnnouncements', icon: 'megaphone-outline' },
];
const ROLES: Role[] = ['player', 'owner', 'academy', 'admin'];
const roleColor: Record<Role, string> = { player: colors.textMuted, owner: colors.info, academy: colors.success, admin: colors.danger };

export default function AdminDashboard() {
  const { t, role } = useApp();
  const [tab, setTab] = useState<Tab>('overview');

  if (role !== 'admin') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('adminDashboard')} />
        <EmptyState icon="lock-closed-outline" title={t('err_admin_only')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('adminDashboard')} />
      <View style={{ paddingBottom: space.sm }}>
        <HScroll gap={8}>
          {TABS.map((x) => (
            <Chip key={x.key} label={t(x.label)} icon={x.icon} selected={tab === x.key} onPress={() => setTab(x.key)} />
          ))}
        </HScroll>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'pitches' && <Pitches />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'tournaments' && <Tournaments />}
        {tab === 'billing' && <BillingAdmin />}
        {tab === 'dues' && <Dues />}
        {tab === 'academies' && <AcademiesPanel />}
        {tab === 'support' && <SupportInbox />}
        {tab === 'announcements' && <Announcements />}
      </ScrollView>
    </View>
  );
}

function Kpi({ icon, value, label, color = colors.primary }: { icon: IconName; value: string | number; label: string; color?: string }) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 6 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Txt v="h2">{value}</Txt>
      <Txt v="tiny" color={colors.textMuted}>
        {label}
      </Txt>
    </Card>
  );
}

function Overview() {
  const { t, money, lang } = useApp();
  const { stats } = useAdmin();
  if (!stats) return <EmptyState icon="cloud-offline-outline" title={t('adminOnlyLive')} />;
  const max = Math.max(1, ...stats.daily.map((d) => d.count));
  return (
    <>
      <Row gap={space.md} wrap align="stretch">
        <Kpi icon="people" value={stats.users.toLocaleString('en-US')} label={t('kpiUsers')} />
        <Kpi icon="calendar" value={stats.bookings7} label={t('kpiBookings7')} />
        <Kpi icon="cash" value={money(stats.revenue7)} label={t('kpiRevenue7')} color={colors.success} />
        <Kpi icon="football" value={stats.pitches} label={t('kpiPitches')} />
        <Kpi icon="school" value={stats.academies} label={t('kpiAcademies')} />
        <Kpi icon="happy" value={stats.students} label={t('kpiStudents')} color={colors.success} />
        <Kpi icon="flash" value={stats.openMatches} label={t('kpiOpenMatches')} color={colors.warning} />
        <Kpi icon="headset" value={stats.openTickets} label={t('kpiOpenTickets')} color={colors.danger} />
      </Row>
      <Card style={{ gap: space.md }}>
        <Txt v="h3">{t('bookingsPerDay')}</Txt>
        <View style={{ flexDirection: lang === 'ar' ? 'row-reverse' : 'row', alignItems: 'flex-end', height: 150, gap: 8 }}>
          {stats.daily.map((d, i) => (
            <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Txt v="tiny" color={i === stats.daily.length - 1 ? colors.primary : colors.textMuted}>
                {d.count}
              </Txt>
              <View style={{ width: '70%', height: Math.max(4, (d.count / max) * 104), borderRadius: 6, backgroundColor: i === stats.daily.length - 1 ? colors.primary : colors.accent }} />
              <Txt v="tiny" color={colors.textMuted}>
                {fromISODate(d.day).getDate()}
              </Txt>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

function Users() {
  const { t, isRTL, errText } = useApp();
  const { users, searchUsers, setRole } = useAdmin();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; role: Role } | null>(null);
  const { mode, refresh } = useApp();
  const [suspended, setSuspended] = useState<Map<string, boolean>>(new Map());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const loadFlags = useCallback(() => {
    if (mode === 'live') api.adminUsersV2(q).then(setSuspended).catch(() => {});
  }, [mode, q]);
  useEffect(loadFlags, [loadFlags]);
  return (
    <>
      <Row gap={8} style={{ backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: space.md, height: 48, borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={(v) => {
            setQ(v);
            searchUsers(v);
          }}
          placeholder={t('searchUsers')}
          placeholderTextColor={colors.textFaint}
          style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text, textAlign: isRTL ? 'right' : 'left', height: '100%', ...webNoOutline }}
        />
      </Row>
      <Card style={{ paddingVertical: space.xs }}>
        {users.map((u, i) => (
          <View key={u.id}>
            <Tap onPress={() => setEditing({ id: u.id, name: u.name, role: u.role })} scale={0.99} style={{ paddingVertical: 12 }}>
              <Row gap={space.md}>
                <Avatar name={u.name || '?'} uri={u.avatarUrl} size={40} color={colors.accentDark} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong" numberOfLines={1}>
                    {u.name || '—'}
                  </Txt>
                  <Txt v="tiny" color={colors.textMuted} style={{ writingDirection: 'ltr' }}>
                    {u.contact} · {u.bookings} {t('todayBookings')}
                  </Txt>
                </View>
                {suspended.get(u.id) && <Badge label={t('suspendedUser')} color={colors.danger} bg={colors.dangerSoft} />}
                <Badge label={t(`role_${u.role}` as StringKey)} color={roleColor[u.role]} bg={colors.surfaceMuted} />
              </Row>
            </Tap>
            {i < users.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={t('changeRole')}>
        {editing && (
          <View style={{ gap: space.md }}>
            <Txt v="bodyStrong">{editing.name}</Txt>
            <Row gap={8} wrap>
              {ROLES.map((r) => (
                <Chip key={r} label={t(`role_${r}` as StringKey)} selected={editing.role === r} onPress={() => setEditing({ ...editing, role: r })} />
              ))}
            </Row>
            <Button
              title={t('save')}
              onPress={async () => {
                const res = await setRole(editing.id, editing.role);
                setEditing(null);
                toast(res.ok ? t('roleUpdated') : errText(res.error), res.ok ? 'success' : 'error');
              }}
            />
            {mode === 'live' && (
              <>
                <Button
                  title={suspended.get(editing.id) ? t('unsuspendUser') : t('suspendUser')}
                  kind="secondary"
                  icon={suspended.get(editing.id) ? 'checkmark-circle-outline' : 'ban-outline'}
                  onPress={async () => {
                    const uid = editing.id;
                    setEditing(null);
                    try {
                      await api.adminSetSuspended(uid, !suspended.get(uid));
                      toast(t('done'), 'success');
                      loadFlags();
                    } catch (e) {
                      toast(errText(api.errorCode(e)), 'error');
                    }
                  }}
                />
                <Button title={t('deleteUser')} kind="danger" icon="trash-outline" onPress={() => { setConfirmDelete(editing.id); setEditing(null); }} />
              </>
            )}
          </View>
        )}
      </Sheet>
      <ConfirmSheet
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('deleteUserConfirm')}
        confirmLabel={t('deleteUser')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={async () => {
          const uid = confirmDelete!;
          setConfirmDelete(null);
          try {
            await api.adminDeleteUser(uid);
            toast(t('done'), 'info');
            searchUsers(q);
            refresh();
          } catch (e) {
            toast(errText(api.errorCode(e)), 'error');
          }
        }}
      />
    </>
  );
}

/** Pitches owners submitted, waiting for approval. */
function PendingPitches() {
  const { t, l, lang, money, allPitches, mode, refresh, reviewDemoListing, errText, state } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState<PendingPitch[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (mode === 'live') {
      try {
        setRows(await api.adminPitchSubmissions());
      } catch {
        setRows([]);
      }
    } else {
      setRows(allPitches.filter((p) => p.status === 'pending').map((p) => ({ pitchId: p.id, ownerId: ME_ID, ownerName: state.profile.name, phone: '', note: '', at: Date.now() })));
    }
  }, [mode, allPitches, state.profile.name]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      if (mode === 'live') {
        await api.adminReviewPitch(id, approve);
        await refresh();
      } else reviewDemoListing(id, approve);
      toast(approve ? t('listingApproved') : t('listingRejected'), approve ? 'success' : 'info');
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(null);
    load();
  };

  if (!rows.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={8}>
        <Ionicons name="time-outline" size={18} color={colors.warning} />
        <Txt v="h3">{t('pendingListings', { n: rows.length })}</Txt>
      </Row>
      {rows.map((r) => {
        const p = allPitches.find((x) => x.id === r.pitchId);
        if (!p) return null;
        return (
          <Card key={r.pitchId} style={{ gap: space.sm, borderWidth: 1, borderColor: colors.warning }}>
            <Txt v="h3">{l(p.name)}</Txt>
            <Txt v="caption" color={colors.textMuted}>
              {l(p.area)} · {t(`gov_${p.governorate}` as StringKey)} · {money(p.pricePerHour)}
              {t('perHour')} · {p.sizes.map((n) => t('aSide', { n })).join('، ')}
            </Txt>
            <Txt v="caption" color={colors.textMuted}>
              {t('openHours', { from: formatHour(p.openFrom, lang), to: formatHour(p.openTo % 24, lang) })} · {p.amenities.map((a) => t(`amenity_${a}` as StringKey)).join('، ')}
            </Txt>
            {!!l(p.address) && (
              <Txt v="caption" color={colors.textMuted} selectable>
                {l(p.address)}
              </Txt>
            )}
            <Row gap={6}>
              <Ionicons name="person-outline" size={15} color={colors.textMuted} />
              <Txt v="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {r.ownerName || '—'}
                {r.phone ? ` · ${r.phone}` : ''}
              </Txt>
              {!!r.phone && <IconButton icon="logo-whatsapp" label="WhatsApp" size={34} color={colors.success} bg={colors.successSoft} onPress={() => Linking.openURL(`https://wa.me/${r.phone.replace(/\D/g, '').replace(/^(\d{8})$/, '965$1')}`)} />}
            </Row>
            {!!r.note && (
              <Txt v="caption" color={colors.text}>
                “{r.note}”
              </Txt>
            )}
            <Row gap={space.sm}>
              <Button title={t('approve')} small icon="checkmark" style={{ flex: 1 }} loading={busy === r.pitchId} onPress={() => decide(r.pitchId, true)} />
              <Button title={t('reject')} small kind="danger" icon="close" style={{ flex: 1 }} disabled={busy === r.pitchId} onPress={() => decide(r.pitchId, false)} />
            </Row>
          </Card>
        );
      })}
      <Divider />
    </View>
  );
}

function Pitches() {
  const { t, l, money, allPitches: everyPitch, errText } = useApp();
  const allPitches = everyPitch.filter((p) => (p.status ?? 'approved') === 'approved');
  const { updatePitch, users } = useAdmin();
  const toast = useToast();
  const [assign, setAssign] = useState<string | null>(null);
  const ownerName = (id?: string) => users.find((u) => u.id === id)?.name;
  return (
    <>
      <PendingPitches />
      {allPitches.map((p) => {
        const active = p.active !== false;
        return (
          <Card key={p.id} style={{ gap: space.sm, opacity: active ? 1 : 0.7 }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Txt v="h3">{l(p.name)}</Txt>
                <Txt v="caption" color={colors.textMuted}>
                  {l(p.area)} · {money(p.pricePerHour)}
                  {t('perHour')}
                </Txt>
              </View>
              <Badge label={active ? t('active') : t('inactive')} color={active ? colors.success : colors.textMuted} bg={active ? colors.successSoft : colors.surfaceMuted} />
            </Row>
            <Row gap={6}>
              <Ionicons name="business-outline" size={15} color={colors.textMuted} />
              <Txt v="caption" color={colors.textMuted}>
                {ownerName(p.ownerId) ?? t('noOwner')}
              </Txt>
            </Row>
            <Row gap={space.sm}>
              <Button
                title={active ? t('hidePitch') : t('showPitch')}
                small
                kind={active ? 'ghost' : 'secondary'}
                icon={active ? 'eye-off-outline' : 'eye-outline'}
                style={{ flex: 1 }}
                onPress={async () => {
                  const r = await updatePitch(p.id, { active: !active });
                  toast(r.ok ? t('pitchUpdated') : errText(r.error), r.ok ? 'success' : 'error');
                }}
              />
              <Button title={t('assignOwner')} small kind="secondary" icon="person-add-outline" style={{ flex: 1 }} onPress={() => setAssign(p.id)} />
              <Button title={t('edit')} small kind="ghost" icon="create-outline" onPress={() => router.push(`/listing/edit/pitch/${p.id}`)} />
            </Row>
          </Card>
        );
      })}
      <Sheet visible={!!assign} onClose={() => setAssign(null)} title={t('assignOwner')}>
        <ScrollView style={{ maxHeight: 420 }}>
          {users.map((u) => (
            <Tap
              key={u.id}
              onPress={async () => {
                const id = assign!;
                setAssign(null);
                const r = await updatePitch(id, { ownerId: u.id });
                toast(r.ok ? t('ownerAssigned') : errText(r.error), r.ok ? 'success' : 'error');
              }}
              scale={0.99}
              style={{ paddingVertical: 10 }}
            >
              <Row gap={space.md}>
                <Avatar name={u.name || '?'} uri={u.avatarUrl} size={34} color={colors.accentDark} />
                <Txt v="bodyStrong" style={{ flex: 1 }}>
                  {u.name}
                </Txt>
                <Txt v="tiny" color={colors.textMuted}>
                  {t(`role_${u.role}` as StringKey)}
                </Txt>
              </Row>
            </Tap>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

function Bookings() {
  const { t, l, lang, money, getPitch, errText } = useApp();
  const { bookings, cancelBooking } = useAdmin();
  const toast = useToast();
  const labels = { today: t('today'), tomorrow: t('tomorrow') };
  return (
    <Card style={{ paddingVertical: space.xs }}>
      {bookings.length === 0 && <EmptyState icon="calendar-outline" title={t('noBookings')} />}
      {bookings.map((b, i) => (
        <View key={b.id}>
          <Row gap={space.md} style={{ paddingVertical: 12, opacity: b.status === 'cancelled' ? 0.5 : 1 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="bodyStrong" numberOfLines={1}>
                {l(getPitch(b.pitchId).name)}
              </Txt>
              <Txt v="tiny" color={colors.textMuted}>
                {formatDay(fromISODate(b.dateISO), lang, labels)} · {formatHour(b.hour, lang)} · {b.playerName || '—'}
              </Txt>
            </View>
            <Txt v="label" color={colors.primary}>
              {money(b.total)}
            </Txt>
            {b.status === 'confirmed' ? (
              <IconButton
                icon="close-circle-outline"
                label={t('cancelBooking')}
                color={colors.danger}
                bg={colors.dangerSoft}
                size={34}
                onPress={async () => {
                  const r = await cancelBooking(b.id);
                  toast(r.ok ? t('bookingCancelledAdmin') : errText(r.error), r.ok ? 'info' : 'error');
                }}
              />
            ) : (
              <Badge label={t('cancelled')} color={colors.danger} bg={colors.dangerSoft} />
            )}
          </Row>
          {i < bookings.length - 1 && <Divider />}
        </View>
      ))}
    </Card>
  );
}

function Tournaments() {
  const { t, l, money, tournaments, errText, getPitch, refresh, mode } = useApp();
  const { setTournamentStatus } = useAdmin();
  const toast = useToast();
  const pending = tournaments.filter((tr) => tr.status === 'pending');
  const rest = tournaments.filter((tr) => tr.status !== 'pending');
  const review = async (id: string, approve: boolean) => {
    if (mode !== 'live') return toast(errText('live_only'), 'error');
    try {
      await api.adminReviewTournament(id, approve);
      await refresh();
      toast(approve ? t('tournamentApprovedToast') : t('listingRejected'), approve ? 'success' : 'info');
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
  };
  return (
    <>
      <Button title={t('newTournament')} icon="add" onPress={() => router.push('/tournament/new')} />
      {pending.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Row gap={8}>
            <Ionicons name="time-outline" size={18} color={colors.warning} />
            <Txt v="h3">{t('pendingTournaments', { n: pending.length })}</Txt>
          </Row>
          {pending.map((tr) => (
            <Card key={tr.id} style={{ gap: space.sm, borderWidth: 1, borderColor: colors.warning }}>
              <Txt v="h3">{l(tr.name)}</Txt>
              <Txt v="caption" color={colors.textMuted}>
                {l(getPitch(tr.pitchId).name)} · {t(`fmt_${tr.formatType ?? 'league'}`)} · {t('aSide', { n: tr.format })} · {tr.maxTeams} {t('teams')}
              </Txt>
              <Txt v="caption" color={colors.textMuted}>
                {t('entryFee')}: {money(tr.entryFee)} · {t('prize')}: {money(tr.prize)}
                {tr.prizeSecond ? ` / ${money(tr.prizeSecond)}` : ''} · {t('organizingFeePct', { pct: Math.round((tr.commissionRate ?? 0) * 100) })}
              </Txt>
              {!!tr.rules && <Txt v="caption">{tr.rules}</Txt>}
              <Row gap={space.sm}>
                <Button title={t('approve')} small icon="checkmark" style={{ flex: 1 }} onPress={() => review(tr.id, true)} />
                <Button title={t('reject')} small kind="danger" icon="close" style={{ flex: 1 }} onPress={() => review(tr.id, false)} />
              </Row>
            </Card>
          ))}
          <Divider />
        </View>
      )}
      {rest.map((tr) => (
        <Card key={tr.id} style={{ gap: space.sm }}>
          <Tap onPress={() => router.push(`/tournament/manage/${tr.id}`)} scale={0.99}>
            <Row justify="space-between">
              <Txt v="h3" style={{ flex: 1 }}>
                {l(tr.name)}
              </Txt>
              <View style={{ transform: [{ scale: 0.95 }] }}>{statusBadge(tr.status, t)}</View>
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {t('teamsCount', { n: tr.teams.filter((tm) => tm.status !== 'rejected' && tm.status !== 'withdrawn').length, max: tr.maxTeams })} · {money(tr.prize)}
            </Txt>
          </Tap>
          <Row gap={6} wrap>
            {(['open', 'closed', 'live', 'finished'] as Tournament['status'][]).map((st) => (
              <Chip
                key={st}
                label={t(`status_${st}`)}
                selected={tr.status === st}
                onPress={async () => {
                  const r = await setTournamentStatus(tr.id, st);
                  toast(r.ok ? t('statusUpdated') : errText(r.error), r.ok ? 'success' : 'error');
                }}
              />
            ))}
          </Row>
        </Card>
      ))}
    </>
  );
}

/** Owner subscriptions: prices, free period, payment link, invoices to confirm. */
function BillingAdmin() {
  const { t, lang, money, mode, errText } = useApp();
  const toast = useToast();
  const [subs, setSubs] = useState<api.Subscription[]>([]);
  const [invoices, setInvoices] = useState<api.Invoice[]>([]);
  const [cfg, setCfg] = useState<api.AppSettings | null>(null);
  const [filter, setFilter] = useState<'open' | 'paid' | 'subs'>('open');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (mode !== 'live') return;
    try {
      await api.adminRunBilling().catch(() => 0);
      const [s, i, c] = await Promise.all([api.billingOverview(true), api.fetchInvoices(), api.appSettings()]);
      setSubs(s);
      setInvoices(i);
      setCfg(c);
    } catch {}
  }, [mode]);
  useEffect(() => {
    load();
  }, [load]);
  const sub = (id: string | null) => subs.find((x) => x.id === id);
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.fetchInvoiceItems>>>([]);
  useEffect(() => {
    if (mode === 'live') api.fetchInvoiceItems().then(setItems).catch(() => {});
  }, [mode, invoices]);
  const ownerName = (ownerId: string) => subs.find((x) => x.ownerId === ownerId)?.ownerName ?? '';
  const claimed = invoices.filter((i) => i.status === 'claimed');
  const unpaid = invoices.filter((i) => i.status === 'unpaid');
  const paid = invoices.filter((i) => i.status === 'paid');
  const monthly = subs.filter((x) => x.status === 'active' || x.status === 'past_due').reduce((a, x) => a + x.price, 0);
  const mark = async (id: string, st: 'paid' | 'void' | 'unpaid') => {
    try {
      await api.adminMarkInvoice(id, st);
      toast(t('done'), 'success');
      load();
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
  };
  const field = { height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space.md, fontFamily: fonts.medium, color: colors.text, ...webNoOutline };

  return (
    <>
      <Row gap={space.md}>
        <Card style={{ flex: 1, gap: 4 }}>
          <Txt v="tiny" color={colors.textMuted}>{t('monthlyRevenue')}</Txt>
          <Txt v="h2" color={colors.success}>{money(monthly)}</Txt>
        </Card>
        <Card style={{ flex: 1, gap: 4 }}>
          <Txt v="tiny" color={colors.textMuted}>{t('awaitingPayment')}</Txt>
          <Txt v="h2" color={colors.warning}>{money([...claimed, ...unpaid].reduce((a, i) => a + i.amount, 0))}</Txt>
        </Card>
      </Row>

      {cfg && (
        <Card style={{ gap: space.md }}>
          <Txt v="h3">{t('billingSettings')}</Txt>
          <Row gap={space.md}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="tiny" color={colors.textMuted}>{t('pricePitchMonthly')}</Txt>
              <Stepper value={cfg.pricePitch} onChange={(v) => setCfg({ ...cfg, pricePitch: v })} min={0} max={1000} step={5} format={(v) => money(v)} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="tiny" color={colors.textMuted}>{t('priceAcademyMonthly')}</Txt>
              <Stepper value={cfg.priceAcademy} onChange={(v) => setCfg({ ...cfg, priceAcademy: v })} min={0} max={1000} step={5} format={(v) => money(v)} />
            </View>
          </Row>
          <Row gap={space.md}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="tiny" color={colors.textMuted}>{t('freeDays')}</Txt>
              <Stepper value={cfg.trialDays} onChange={(v) => setCfg({ ...cfg, trialDays: v })} min={0} max={180} step={1} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="tiny" color={colors.textMuted}>{t('graceDays')}</Txt>
              <Stepper value={cfg.graceDays} onChange={(v) => setCfg({ ...cfg, graceDays: v })} min={0} max={60} step={1} />
            </View>
          </Row>
          <View style={{ gap: 4 }}>
            <Txt v="tiny" color={colors.textMuted}>{t('bankPaymentLink')}</Txt>
            <TextInput value={cfg.paymentLink} onChangeText={(v) => setCfg({ ...cfg, paymentLink: v })} autoCapitalize="none" keyboardType="url" placeholder="https://…" placeholderTextColor={colors.textFaint} style={field} />
            <Txt v="tiny" color={colors.textFaint}>{t('bankPaymentLinkHint')}</Txt>
          </View>
          <Button
            title={t('save')}
            small
            loading={saving}
            onPress={async () => {
              setSaving(true);
              try {
                await api.adminSetBilling(cfg);
                toast(t('done'), 'success');
              } catch (e) {
                toast(errText(api.errorCode(e)), 'error');
              }
              setSaving(false);
            }}
          />
        </Card>
      )}

      <Row gap={6} wrap>
        <Chip label={`${t('toConfirm')} (${claimed.length + unpaid.length})`} selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label={t('inv_paid')} selected={filter === 'paid'} onPress={() => setFilter('paid')} />
        <Chip label={`${t('subscriptionsTab')} (${subs.length})`} selected={filter === 'subs'} onPress={() => setFilter('subs')} />
      </Row>

      {filter === 'subs' &&
        (subs.length === 0 ? (
          <EmptyState icon="card-outline" title={t('noSubscriptions')} />
        ) : (
          subs.map((x) => (
            <Card key={x.id} style={{ gap: 4 }}>
              <Row justify="space-between" gap={space.sm}>
                <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{x.ownerName}</Txt>
                {subStatusBadge(x.status, t)}
              </Row>
              <Txt v="caption" color={colors.textMuted}>
                {x.listingName} · {t(x.kind === 'pitch' ? 'adminPitches' : 'adminAcademies')} · {x.status === 'trial' ? t('freeUntil', { date: fmtDate(x.trialEndsAt, lang) }) : t('paidUntil', { date: fmtDate(x.paidUntil, lang) })}
              </Txt>
            </Card>
          ))
        ))}

      {filter !== 'subs' &&
        ((filter === 'open' ? [...claimed, ...unpaid] : paid).length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title={t('noInvoices')} />
        ) : (
          (filter === 'open' ? [...claimed, ...unpaid] : paid).map((inv) => (
            <Card key={inv.id} style={{ gap: 6, borderWidth: inv.status === 'claimed' ? 1.5 : 0, borderColor: colors.info }}>
              <Row justify="space-between">
                <Txt v="h3">{money(inv.amount)}</Txt>
                {invoiceBadge(inv.status, t)}
              </Row>
              <Txt v="caption" color={colors.textMuted}>{ownerName(inv.ownerId)}</Txt>
              {items.filter((x) => x.invoiceId === inv.id).map((x, k) => (
                <Row key={k} justify="space-between" gap={space.sm}>
                  <Txt v="tiny" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={2}>{lang === 'ar' ? x.labelAr : x.labelEn}</Txt>
                  <Txt v="tiny">{money(x.amount)}</Txt>
                </Row>
              ))}
              <Txt v="tiny" color={colors.textMuted}>
                {fmtDate(inv.periodStart, lang)} → {fmtDate(inv.periodEnd, lang)} · {t('dueOn', { date: fmtDate(inv.dueAt, lang) })}
              </Txt>
              {inv.status !== 'paid' ? (
                <Row gap={space.sm}>
                  <Button title={t('confirmPaid')} small icon="checkmark" style={{ flex: 1 }} onPress={() => mark(inv.id, 'paid')} />
                  <Button title={t('voidInvoice')} small kind="ghost" style={{ flex: 1 }} onPress={() => mark(inv.id, 'void')} />
                </Row>
              ) : (
                <Button title={t('undoPaid')} small kind="ghost" onPress={() => mark(inv.id, 'unpaid')} />
              )}
            </Card>
          ))
        ))}
    </>
  );
}

/** Organising fees owed by pitch owners for their tournaments, and the fee rate. */
function Dues() {
  const { t, l, money, mode, errText } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState<DuesRow[]>([]);
  const [rate, setRate] = useState(5);
  const load = useCallback(() => {
    if (mode !== 'live') return;
    api.fetchDues(false).then(setRows).catch(() => {});
    api.appSettings().then((s) => setRate(Math.round(s.commissionRate * 100))).catch(() => {});
  }, [mode]);
  useEffect(load, [load]);
  const owed = rows.filter((r) => !r.settled).reduce((s, r) => s + r.amount, 0);
  const collected = rows.filter((r) => r.settled).reduce((s, r) => s + r.amount, 0);
  const saveRate = async (v: number) => {
    setRate(v);
    try {
      await api.setCommission(v / 100);
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
  };
  return (
    <>
      <Card style={{ gap: space.sm }}>
        <Txt v="label" color={colors.textMuted}>{t('commissionRate')}</Txt>
        <Stepper value={rate} onChange={saveRate} min={0} max={50} format={(v) => `${v}%`} />
      </Card>
      <Row gap={space.md}>
        <Card style={{ flex: 1, gap: 4 }}>
          <Txt v="tiny" color={colors.textMuted}>{t('duesOwed')}</Txt>
          <Txt v="h2" color={colors.warning}>{money(owed)}</Txt>
        </Card>
        <Card style={{ flex: 1, gap: 4 }}>
          <Txt v="tiny" color={colors.textMuted}>{t('duesCollected')}</Txt>
          <Txt v="h2" color={colors.success}>{money(collected)}</Txt>
        </Card>
      </Row>
      {rows.length === 0 ? (
        <EmptyState icon="cash-outline" title={t('noDues')} />
      ) : (
        rows.map((r) => (
          <Card key={r.tournamentId} style={{ gap: 6 }}>
            <Row justify="space-between" gap={space.sm}>
              <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{l(r.name)}</Txt>
              <Txt v="h3" color={r.settled ? colors.success : colors.text}>{money(r.amount)}</Txt>
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {r.organizerName} · {t(`status_${r.status}`)} · {t('paidTeamsN', { n: r.paidTeams })} × {money(r.entryFee)} × {Math.round(r.rate * 100)}%
            </Txt>
            <Chip
              label={r.settled ? t('settled') : t('markSettled')}
              icon="cash-outline"
              selected={r.settled}
              onPress={async () => {
                try {
                  await api.markDues(r.tournamentId, !r.settled);
                  load();
                } catch (e) {
                  toast(errText(api.errorCode(e)), 'error');
                }
              }}
            />
          </Card>
        ))
      )}
    </>
  );
}

/** Academies owners submitted, waiting for approval. */
function PendingAcademies() {
  const { t, l, errText } = useApp();
  const { allAcademies, loadPendingAcademies, reviewAcademy } = useAcademies();
  const toast = useToast();
  const [rows, setRows] = useState<{ academyId: string; ownerName: string; phone: string; note: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    loadPendingAcademies().then(setRows);
  }, [loadPendingAcademies]);
  useEffect(load, [load]);
  if (!rows.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={8}>
        <Ionicons name="time-outline" size={18} color={colors.warning} />
        <Txt v="h3">{t('pendingListings', { n: rows.length })}</Txt>
      </Row>
      {rows.map((r) => {
        const a = allAcademies.find((x) => x.id === r.academyId);
        if (!a) return null;
        return (
          <Card key={r.academyId} style={{ gap: space.sm, borderWidth: 1, borderColor: colors.warning }}>
            <Txt v="h3">{l(a.name)}</Txt>
            <Txt v="caption" color={colors.textMuted}>
              {l(a.area)} · {t(`gov_${a.governorate}` as StringKey)}
            </Txt>
            {!!l(a.about) && <Txt v="caption" color={colors.text}>{l(a.about)}</Txt>}
            <Row gap={6}>
              <Ionicons name="person-outline" size={15} color={colors.textMuted} />
              <Txt v="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {r.ownerName || '—'}
                {r.phone ? ` · ${r.phone}` : ''}
              </Txt>
              {!!r.phone && <IconButton icon="logo-whatsapp" label="WhatsApp" size={34} color={colors.success} bg={colors.successSoft} onPress={() => Linking.openURL(`https://wa.me/${r.phone.replace(/\D/g, '').replace(/^(\d{8})$/, '965$1')}`)} />}
            </Row>
            {!!r.note && <Txt v="caption" color={colors.text}>“{r.note}”</Txt>}
            <Row gap={space.sm}>
              {([true, false] as const).map((approve) => (
                <Button
                  key={String(approve)}
                  title={approve ? t('approve') : t('reject')}
                  small
                  kind={approve ? 'primary' : 'danger'}
                  icon={approve ? 'checkmark' : 'close'}
                  style={{ flex: 1 }}
                  loading={approve && busy === r.academyId}
                  disabled={!approve && busy === r.academyId}
                  onPress={async () => {
                    setBusy(r.academyId);
                    const res = await reviewAcademy(r.academyId, approve);
                    setBusy(null);
                    toast(res.ok ? (approve ? t('academyApproved') : t('listingRejected')) : errText(res.error), res.ok ? 'success' : 'error');
                    load();
                  }}
                />
              ))}
            </Row>
          </Card>
        );
      })}
      <Divider />
    </View>
  );
}

function AcademiesPanel() {
  const { t, l, money } = useApp();
  const { allAcademies, programs } = useAcademies();
  const academies = allAcademies.filter((a) => (a.status ?? 'approved') === 'approved');
  return (
    <>
      <PendingAcademies />
      {academies.map((a) => {
        const ps = programs.filter((p) => p.academyId === a.id);
        const students = ps.reduce((s, p) => s + p.enrolled, 0);
        const revenue = ps.reduce((s, p) => s + p.enrolled * p.monthlyFee, 0);
        return (
          <Card key={a.id} onPress={() => router.push(`/academy/${a.id}`)} style={{ gap: space.sm }}>
            <Row justify="space-between" gap={space.sm}>
              <Txt v="h3" style={{ flex: 1 }}>{l(a.name)}</Txt>
              <Button title={t('edit')} small kind="ghost" icon="create-outline" onPress={() => router.push(`/listing/edit/academy/${a.id}`)} />
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {l(a.area)} · {ps.length} {t('programs')}
            </Txt>
            <Row gap={space.lg}>
              <Badge label={`${students} ${t('students')}`} icon="people-outline" />
              <Badge label={`${money(revenue)}${t('perMonth')}`} icon="cash-outline" color={colors.success} bg={colors.successSoft} />
            </Row>
          </Card>
        );
      })}
    </>
  );
}

function SupportInbox() {
  const { t } = useApp();
  const { tickets } = useSupport();
  const d = useDir();
  const [filter, setFilter] = useState<TicketStatus | null>('open');
  const list = tickets.filter((tk) => !filter || tk.status === filter);
  return (
    <>
      <Row gap={6} wrap>
        <Chip label={t('allTickets')} selected={!filter} onPress={() => setFilter(null)} />
        <Chip label={t('filterOpen')} selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label={t('filterAnswered')} selected={filter === 'answered'} onPress={() => setFilter('answered')} />
        <Chip label={t('filterClosed')} selected={filter === 'closed'} onPress={() => setFilter('closed')} />
      </Row>
      {list.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title={t('noTickets')} />
      ) : (
        <Card style={{ paddingVertical: space.xs }}>
          {list.map((tk, i) => (
            <View key={tk.id}>
              <Tap onPress={() => router.push({ pathname: '/support/[id]', params: { id: tk.id, admin: '1' } })} scale={0.99} style={{ paddingVertical: 12 }}>
                <Row gap={space.md}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt v="bodyStrong" numberOfLines={1}>
                      {tk.subject}
                    </Txt>
                    <Row gap={6}>
                      <Badge label={t(`status_t_${tk.status}` as StringKey)} color={ticketStatusStyle[tk.status].color} bg={ticketStatusStyle[tk.status].bg} />
                      <Txt v="tiny" color={colors.textMuted}>
                        {t(`cat_${tk.category}` as StringKey)} · {tk.userName}
                      </Txt>
                    </Row>
                  </View>
                  <Ionicons name={d.forward} size={18} color={colors.textFaint} />
                </Row>
              </Tap>
              {i < list.length - 1 && <Divider />}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function Announcements() {
  const { t, l, isRTL, errText } = useApp();
  const { announcements, postAnnouncement, setAnnouncementActive } = useAdmin();
  const toast = useToast();
  const [text, setText] = useState('');
  return (
    <>
      <Card style={{ gap: space.md }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('announcementPlaceholder')}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={280}
          style={{ minHeight: 90, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: space.md, fontFamily: fonts.regular, fontSize: 15, color: colors.text, textAlignVertical: 'top', textAlign: isRTL ? 'right' : 'left', ...webNoOutline }}
        />
        <Button
          title={t('publish')}
          icon="megaphone"
          disabled={text.trim().length < 3}
          onPress={async () => {
            const r = await postAnnouncement(text.trim());
            if (!r.ok) return toast(errText(r.error), 'error');
            setText('');
            toast(t('announcementPublished'));
          }}
        />
      </Card>
      {announcements.length === 0 && <EmptyState icon="megaphone-outline" title={t('noAnnouncements')} />}
      {announcements.map((a) => (
        <Card key={a.id} style={{ gap: space.sm, opacity: a.active ? 1 : 0.6 }}>
          <Txt v="body">{l(a.body)}</Txt>
          <Row justify="space-between">
            <Badge label={a.active ? t('active') : t('inactive')} color={a.active ? colors.success : colors.textMuted} bg={a.active ? colors.successSoft : colors.surfaceMuted} />
            <Button title={a.active ? t('turnOff') : t('turnOn')} small kind="ghost" onPress={() => setAnnouncementActive(a.id, !a.active)} />
          </Row>
        </Card>
      ))}
    </>
  );
}
