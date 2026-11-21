import React from 'react';
import type * as api from '@/lib/api';
import type { useApp } from '@/store/AppStore';
import { colors } from '@/theme';
import { Badge } from './ui';

export function subStatusBadge(status: api.Subscription['status'], t: ReturnType<typeof useApp>['t']) {
  const m = {
    trial: { c: colors.info, bg: colors.primarySoft },
    active: { c: colors.success, bg: colors.successSoft },
    past_due: { c: colors.warning, bg: colors.warningSoft },
    suspended: { c: colors.danger, bg: colors.dangerSoft },
    cancelled: { c: colors.textMuted, bg: colors.surfaceMuted },
  }[status];
  return <Badge label={t(`sub_${status}`)} color={m.c} bg={m.bg} />;
}

export function invoiceBadge(status: api.Invoice['status'], t: ReturnType<typeof useApp>['t']) {
  const m = {
    unpaid: { c: colors.warning, bg: colors.warningSoft },
    claimed: { c: colors.info, bg: colors.primarySoft },
    paid: { c: colors.success, bg: colors.successSoft },
    void: { c: colors.textMuted, bg: colors.surfaceMuted },
  }[status];
  return <Badge label={t(`inv_${status}`)} color={m.c} bg={m.bg} />;
}

export const fmtDate = (iso: string, lang: 'ar' | 'en') =>
  new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' });

