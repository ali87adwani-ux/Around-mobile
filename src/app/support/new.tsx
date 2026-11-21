import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Chip, Field, Row, Txt, webNoOutline } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useApp } from '@/store/AppStore';
import { useSupport, type TicketCategory } from '@/store/support';
import { colors, fonts, radius, space } from '@/theme';

const CATS: TicketCategory[] = ['booking', 'payment', 'account', 'pitch', 'academy', 'other'];

export default function NewTicket() {
  const { t, isRTL } = useApp();
  const { openTicket } = useSupport();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<TicketCategory>('booking');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const valid = subject.trim().length >= 3 && body.trim().length >= 1;

  const send = async () => {
    setTried(true);
    if (!valid) return;
    setSending(true);
    const r = await openTicket({ category, subject: subject.trim(), body: body.trim() });
    setSending(false);
    if (!r.ok) return toast(t('err_unknown'), 'error');
    toast(t('ticketSent'));
    router.replace(`/support/${r.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('newTicket')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.sm }}>
          <Txt v="label" color={colors.textMuted}>
            {t('ticketCategory')}
          </Txt>
          <Row gap={8} wrap>
            {CATS.map((c) => (
              <Chip key={c} label={t(`cat_${c}` as StringKey)} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </Row>
        </View>
        <Field label={t('ticketSubject')} placeholder={t('ticketSubjectPlaceholder')} value={subject} onChangeText={setSubject} maxLength={120} error={tried && subject.trim().length < 3 ? t('required') : undefined} />
        <View style={{ gap: 6 }}>
          <Txt v="label" color={colors.textMuted}>
            {t('ticketMessage')}
          </Txt>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('ticketMessagePlaceholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={4000}
            style={{ minHeight: 140, borderRadius: radius.md, borderWidth: 1.5, borderColor: tried && !body.trim() ? colors.danger : colors.border, backgroundColor: colors.card, padding: space.lg, fontFamily: fonts.regular, fontSize: 15, color: colors.text, textAlignVertical: 'top', textAlign: isRTL ? 'right' : 'left', ...webNoOutline }}
          />
        </View>
      </ScrollView>
      <View style={{ padding: space.lg, paddingBottom: insets.bottom + space.md }}>
        <Button title={t('sendTicket')} icon="send" loading={sending} onPress={send} />
      </View>
    </View>
  );
}
