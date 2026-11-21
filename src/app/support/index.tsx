import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, Card, Divider, EmptyState, Row, Tap, Txt, useDir } from '@/components/ui';
import { SUPPORT_WHATSAPP } from '@/config';
import type { StringKey } from '@/i18n/strings';
import { useApp } from '@/store/AppStore';
import { ticketStatusStyle, useSupport } from '@/store/support';
import { colors, radius, space } from '@/theme';

export default function SupportHome() {
  const { t } = useApp();
  const { tickets } = useSupport();
  const d = useDir();
  const [open, setOpen] = useState<number | null>(0);
  const mine = tickets;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('support')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        <Card style={{ backgroundColor: colors.primary, gap: space.md }}>
          <Row gap={space.md}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="headset" size={24} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="h3" color={colors.white}>
                {t('support')}
              </Txt>
              <Txt v="caption" color="rgba(255,255,255,0.75)">
                {t('supportSub')}
              </Txt>
            </View>
          </Row>
          <Row gap={space.sm}>
            <Button title={t('newTicket')} kind="light" small icon="create-outline" onPress={() => router.push('/support/new')} style={{ flex: 1 }} />
            <Button title={t('whatsappUs')} kind="accent" small icon="logo-whatsapp" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`).catch(() => {})} style={{ flex: 1 }} />
          </Row>
          <Txt v="tiny" color="rgba(255,255,255,0.6)" center>
            {t('supportHours')}
          </Txt>
        </Card>

        <View style={{ gap: space.md }}>
          <Txt v="h2">{t('myTickets')}</Txt>
          {mine.length === 0 ? (
            <Card flat style={{ borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: 'transparent' }}>
              <EmptyState icon="chatbubbles-outline" title={t('noTickets')} body={t('noTicketsSub')} />
            </Card>
          ) : (
            <Card style={{ paddingVertical: space.xs }}>
              {mine.map((tk, i) => (
                <View key={tk.id}>
                  <Tap onPress={() => router.push(`/support/${tk.id}`)} scale={0.99} style={{ paddingVertical: 14 }}>
                    <Row gap={space.md}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Txt v="bodyStrong" numberOfLines={1}>
                          {tk.subject}
                        </Txt>
                        <Row gap={6}>
                          <Badge label={t(`status_t_${tk.status}` as StringKey)} color={ticketStatusStyle[tk.status].color} bg={ticketStatusStyle[tk.status].bg} />
                          <Txt v="tiny" color={colors.textMuted}>
                            {t(`cat_${tk.category}` as StringKey)}
                          </Txt>
                        </Row>
                      </View>
                      <Ionicons name={d.forward} size={18} color={colors.textFaint} />
                    </Row>
                  </Tap>
                  {i < mine.length - 1 && <Divider />}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ gap: space.md }}>
          <Txt v="h2">{t('faq')}</Txt>
          <Card style={{ paddingVertical: space.xs }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => {
              const isOpen = open === i;
              return (
                <View key={n}>
                  <Tap onPress={() => setOpen(isOpen ? null : i)} scale={0.99} style={{ paddingVertical: 14, gap: 8 }} accessibilityState={{ expanded: isOpen }}>
                    <Row gap={space.md}>
                      <Txt v="bodyStrong" style={{ flex: 1 }}>
                        {t(`faq${n}q` as StringKey)}
                      </Txt>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                    </Row>
                    {isOpen && (
                      <Txt v="body" color={colors.textMuted}>
                        {t(`faq${n}a` as StringKey)}
                      </Txt>
                    )}
                  </Tap>
                  {i < 7 && <Divider />}
                </View>
              );
            })}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
