import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useApp } from '@/store/AppStore';
import { colors } from '@/theme';
import { Row, Txt } from './ui';

/** Review state of a pitch an owner listed. */
export function ListingStatus({ status }: { status?: 'pending' | 'approved' | 'rejected' }) {
  const { t } = useApp();
  const s = status ?? 'approved';
  const m = {
    pending: { label: t('statusPending'), color: colors.warning, bg: colors.warningSoft, icon: 'time-outline' as const },
    approved: { label: t('statusApproved'), color: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' as const },
    rejected: { label: t('statusRejected'), color: colors.danger, bg: colors.dangerSoft, icon: 'close-circle' as const },
  }[s];
  return (
    <Row gap={4} style={{ alignSelf: 'flex-start', backgroundColor: m.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}>
      <Ionicons name={m.icon} size={13} color={m.color} />
      <Txt v="tiny" color={m.color}>
        {m.label}
      </Txt>
    </Row>
  );
}
