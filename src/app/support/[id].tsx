import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, EmptyState, IconButton, Row, Txt, webNoOutline } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useApp } from '@/store/AppStore';
import { ticketStatusStyle, useSupport } from '@/store/support';
import { colors, fonts, radius, space } from '@/theme';

/** Ticket thread. `admin=1` shows it from the support team's side (super admin dashboard). */
export default function TicketThread() {
  const { id, admin } = useLocalSearchParams<{ id: string; admin?: string }>();
  const asSupport = admin === '1';
  const { t, isRTL, lang } = useApp();
  const { getTicket, sendMessage, setStatus } = useSupport();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const tk = getTicket(id);

  if (!tk) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('support')} />
        <EmptyState icon="chatbubbles-outline" title={t('noResults')} />
      </View>
    );
  }

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const r = await sendMessage(tk.id, text.trim(), asSupport);
    setSending(false);
    if (!r.ok) return toast(t('err_unknown'), 'error');
    setText('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  };

  const time = (at: number) => new Date(at).toLocaleString(lang === 'ar' ? 'ar-KW' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={tk.subject} />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Row justify="space-between">
          <Row gap={6}>
            <Badge label={t(`status_t_${tk.status}` as StringKey)} color={ticketStatusStyle[tk.status].color} bg={ticketStatusStyle[tk.status].bg} />
            <Txt v="tiny" color={colors.textMuted}>
              {t(`cat_${tk.category}` as StringKey)}
              {asSupport && tk.userName ? ` · ${tk.userName}` : ''}
            </Txt>
          </Row>
          <Button
            title={tk.status === 'closed' ? t('reopenTicket') : t('closeTicket')}
            small
            kind={tk.status === 'closed' ? 'secondary' : 'ghost'}
            icon={tk.status === 'closed' ? 'refresh' : 'checkmark-done'}
            onPress={() => setStatus(tk.id, tk.status === 'closed' ? 'open' : 'closed')}
          />
        </Row>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {tk.messages.map((m) => {
          // "Mine" is the side of whoever is looking: the player, or support in admin view.
          const mine = asSupport ? m.fromSupport : !m.fromSupport;
          const alignEnd = mine !== isRTL; // mine on the trailing side in each language
          return (
            <View key={m.id} style={{ alignItems: alignEnd ? 'flex-end' : 'flex-start' }}>
              {m.fromSupport && !asSupport && (
                <Row gap={4} style={{ marginBottom: 4 }}>
                  <Ionicons name="headset" size={13} color={colors.primary} />
                  <Txt v="tiny" color={colors.primary}>
                    {t('supportTeam')}
                  </Txt>
                </Row>
              )}
              <View style={{ maxWidth: '82%', backgroundColor: mine ? colors.primary : colors.card, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: mine ? 0 : 1, borderColor: colors.border }}>
                <Txt v="body" color={mine ? colors.white : colors.text}>
                  {m.body}
                </Txt>
              </View>
              <Txt v="tiny" color={colors.textFaint} style={{ marginTop: 3 }}>
                {time(m.at)}
              </Txt>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Row gap={space.sm} align="flex-end">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('writeReply')}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={4000}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surfaceMuted, paddingHorizontal: space.lg, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 15, color: colors.text, textAlign: isRTL ? 'right' : 'left', ...webNoOutline }}
          />
          <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}>
            <IconButton icon="send" label={t('send')} bg={colors.primary} color={colors.white} size={44} onPress={sending ? undefined : send} />
          </View>
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}
