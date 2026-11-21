/** Report a player to the admins (abuse, violence, unsporting behaviour…). */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Sheet, useToast } from '@/components/overlays';
import { Button, Chip, Field, Row, Txt } from '@/components/ui';
import * as api from '@/lib/api';
import { useApp } from '@/store/AppStore';
import { colors, space } from '@/theme';

const REASONS: api.ReportReason[] = ['abuse', 'violence', 'unsporting', 'no_show', 'cheating', 'other'];

export function ReportSheet({ userId, name, matchId, visible, onClose }: { userId: string; name: string; matchId?: string; visible: boolean; onClose: () => void }) {
  const { t, mode, errText } = useApp();
  const toast = useToast();
  const [reason, setReason] = useState<api.ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      if (mode === 'live') await api.reportUser(userId, reason, details.trim(), matchId);
      toast(t('reportSent'), 'success');
      setReason(null);
      setDetails('');
      onClose();
    } catch (e) {
      toast(errText(api.errorCode(e)), 'error');
    }
    setBusy(false);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reportPlayerTitle', { name })}>
      <View style={{ gap: space.md }}>
        <Txt v="caption" color={colors.textMuted}>{t('reportHint')}</Txt>
        <Row gap={8} wrap>
          {REASONS.map((r) => (
            <Chip key={r} label={t(`reason_${r}` as never)} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </Row>
        <Field label={t('reportDetails')} placeholder={t('reportDetailsPh')} value={details} onChangeText={(v) => setDetails(v.slice(0, 1000))} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
        <Button title={t('sendReport')} icon="flag" kind="danger" disabled={!reason} loading={busy} onPress={send} />
      </View>
    </Sheet>
  );
}
