/** Owner subscriptions: free month, monthly invoices, pay through the bank link, tell us you paid. */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmSheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Card, EmptyState, Row, Txt } from '@/components/ui';
import { fmtDate, invoiceBadge, subStatusBadge } from '@/components/billing';
import { SUPPORT_WHATSAPP } from '@/config';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

export default function Billing() {
  const { t, lang, money, mode, errText } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [subs, setSubs] = useState<api.Subscription[]>([]);
  const [invoices, setInvoices] = useState<api.Invoice[]>([]);
  const [settings, setSettings] = useState<api.AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (mode !== 'live') return;
    setLoading(true);
    try {
      const [s, i, st] = await Promise.all([api.billingOverview(false), api.fetchInvoices(), api.appSettings()]);
      setSubs(s);
      setInvoices(i);
      setSettings(st);
    } catch {}
    setLoading(false);
  }, [mode]);
  useEffect(() => {
    load();
  }, [load]);

  const subName = (id: string) => subs.find((s) => s.id === id)?.listingName ?? '';
  const pay = (inv: api.Invoice) => {
    const link = inv.paymentLink || settings?.paymentLink;
    if (link) Linking.openURL(link);
    else Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t('payViaSupportMsg', { amount: money(inv.amount) }))}`);
  };
  const open = invoices.filter((i) => i.status === 'unpaid' || i.status === 'claimed');
  const past = invoices.filter((i) => i.status === 'paid' || i.status === 'void');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('billingTitle')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xxl }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        {settings && (
          <Card flat style={{ backgroundColor: colors.primarySoft, gap: 4 }}>
            <Row gap={8}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <Txt v="bodyStrong" color={colors.primary} style={{ flex: 1 }}>
                {t('billingHowTitle')}
              </Txt>
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {t('billingHowBody', { days: settings.trialDays, pitch: money(settings.pricePitch), academy: money(settings.priceAcademy), grace: settings.graceDays })}
            </Txt>
          </Card>
        )}

        {subs.length === 0 && !loading ? (
          <EmptyState icon="card-outline" title={t('noSubscriptions')} body={t('noSubscriptionsSub')} />
        ) : (
          subs.map((s) => (
            <Card key={s.id} style={{ gap: 6 }}>
              <Row justify="space-between" gap={space.sm}>
                <Row gap={8} style={{ flex: 1 }}>
                  <Ionicons name={s.kind === 'pitch' ? 'football-outline' : 'school-outline'} size={18} color={colors.primary} />
                  <Txt v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {s.listingName}
                  </Txt>
                </Row>
                {subStatusBadge(s.status, t)}
              </Row>
              <Txt v="caption" color={colors.textMuted}>
                {s.status === 'trial' ? t('freeUntil', { date: fmtDate(s.trialEndsAt, lang) }) : s.status === 'suspended' ? t('suspendedHint') : t('paidUntil', { date: fmtDate(s.paidUntil, lang) })}
                {' · '}
                {t('perMonthPrice', { price: money(s.price) })}
              </Txt>
            </Card>
          ))
        )}

        {open.length > 0 && <Txt v="h3" style={{ marginTop: space.sm }}>{t('openInvoices')}</Txt>}
        {open.map((inv) => (
          <Card key={inv.id} style={{ gap: space.sm, borderWidth: 1, borderColor: inv.status === 'unpaid' ? colors.warning : colors.border }}>
            <Row justify="space-between">
              <Txt v="h2">{money(inv.amount)}</Txt>
              {invoiceBadge(inv.status, t)}
            </Row>
            <Txt v="caption" color={colors.textMuted}>
              {subName(inv.subscriptionId)} · {fmtDate(inv.periodStart, lang)} → {fmtDate(inv.periodEnd, lang)}
            </Txt>
            <Txt v="caption" color={new Date(inv.dueAt).getTime() < Date.now() ? colors.danger : colors.textMuted}>
              {t('dueOn', { date: fmtDate(inv.dueAt, lang) })}
            </Txt>
            {inv.status === 'unpaid' ? (
              <Row gap={space.sm}>
                <Button title={t('payNow')} icon="card" style={{ flex: 1 }} onPress={() => pay(inv)} />
                <Button title={t('iPaid')} kind="secondary" icon="checkmark" style={{ flex: 1 }} onPress={() => setClaim(inv.id)} />
              </Row>
            ) : (
              <Txt v="caption" color={colors.info}>{t('claimedHint')}</Txt>
            )}
          </Card>
        ))}

        {past.length > 0 && <Txt v="h3" style={{ marginTop: space.sm }}>{t('pastInvoices')}</Txt>}
        {past.map((inv) => (
          <Card key={inv.id} flat style={{ gap: 4 }}>
            <Row justify="space-between">
              <Txt v="bodyStrong">{money(inv.amount)}</Txt>
              {invoiceBadge(inv.status, t)}
            </Row>
            <Txt v="tiny" color={colors.textMuted}>
              {subName(inv.subscriptionId)} · {fmtDate(inv.periodStart, lang)} → {fmtDate(inv.periodEnd, lang)}
            </Txt>
          </Card>
        ))}
      </ScrollView>
      <ConfirmSheet
        visible={!!claim}
        onClose={() => setClaim(null)}
        title={t('iPaidConfirm')}
        confirmLabel={t('iPaid')}
        cancelLabel={t('cancel')}
        onConfirm={async () => {
          const id = claim!;
          setClaim(null);
          try {
            await api.claimInvoice(id);
            toast(t('claimSent'), 'success');
            load();
          } catch (e) {
            toast(errText(api.errorCode(e)), 'error');
          }
        }}
      />
    </View>
  );
}
