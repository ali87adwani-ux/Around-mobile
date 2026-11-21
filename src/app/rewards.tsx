import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge, Button, Card, Progress, Row, Stat, Txt } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { REWARDS, TIERS, useEngagement } from '@/store/engagement';
import { colors, radius, space } from '@/theme';

const tierColor = { bronze: '#B0713A', silver: '#8E9AAF', gold: '#D9A21A' } as const;

export default function Rewards() {
  const { t, lang, errText } = useApp();
  const { stats, redemptions, redeem } = useEngagement();
  const toast = useToast();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('myPoints')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        <Card style={{ backgroundColor: colors.primary, gap: space.md }}>
          <Row justify="space-between">
            <View>
              <Txt v="caption" color="rgba(255,255,255,0.75)">
                {t('myPoints')}
              </Txt>
              <Txt style={{ fontSize: 40, lineHeight: 50 }} v="display" color={colors.white}>
                {stats.points}
              </Txt>
            </View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Ionicons name="medal" size={40} color={tierColor[stats.tier]} />
              <Txt v="label" color={colors.white}>
                {t(`tier_${stats.tier}`)}
              </Txt>
            </View>
          </Row>
          <Progress value={stats.nextTier ? stats.earned / stats.nextTier.min : 1} color={colors.accent} />
          <Txt v="tiny" color="rgba(255,255,255,0.75)">
            {stats.nextTier ? t('toNextTier', { n: stats.nextTier.min - stats.earned, tier: t(`tier_${stats.nextTier.key}`) }) : t('topTier')}
          </Txt>
          <Row gap={6} wrap>
            {TIERS.map((x) => (
              <Badge key={x.key} label={`${t(`tier_${x.key}`)} ${x.min}+`} color={colors.white} bg={stats.tier === x.key ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'} />
            ))}
          </Row>
        </Card>

        <Card>
          <Row>
            <Stat icon="football" value={stats.played} label={t('matchesPlayed')} />
            <Stat icon="calendar" value={stats.bookings} label={t('todayBookings')} />
            <Stat icon="trophy" value={stats.mvp} label={t('mvp')} color={colors.warning} />
            <Stat icon="shield-checkmark" value={`${stats.reliability}%`} label={t('reliability')} color={colors.success} />
          </Row>
        </Card>
        <Txt v="caption" color={colors.textMuted} center>
          {t('howToEarn')}
        </Txt>

        <Txt v="h2">{t('rewards')}</Txt>
        {REWARDS.map((r) => (
          <Card key={r.key} style={{ gap: space.md }}>
            <Row gap={space.md}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={r.key === 'free_hour' ? 'time' : 'pricetag'} size={22} color={colors.success} />
              </View>
              <Txt v="bodyStrong" style={{ flex: 1 }}>
                {t(`reward_${r.key}`)}
              </Txt>
            </Row>
            <Button
              title={t('redeem', { n: r.cost })}
              small
              kind={stats.points >= r.cost ? 'primary' : 'secondary'}
              disabled={stats.points < r.cost}
              onPress={async () => {
                const res = await redeem(r.key);
                toast(res.ok ? t('redeemed') : errText(res.error), res.ok ? 'success' : 'error');
              }}
            />
          </Card>
        ))}

        {redemptions.length > 0 && (
          <>
            <Txt v="h2">{t('myCodes')}</Txt>
            {redemptions.map((r) => (
              <Card key={r.id} flat style={{ borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
                <Row justify="space-between">
                  <View>
                    <Txt v="bodyStrong">{t(`reward_${r.reward}`)}</Txt>
                    <Txt v="tiny" color={colors.textMuted}>
                      {new Date(r.at).toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-GB')}
                    </Txt>
                  </View>
                  <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Txt v="h3" color={colors.primary} style={{ letterSpacing: 2 }} selectable>
                      {r.code}
                    </Txt>
                  </View>
                </Row>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
