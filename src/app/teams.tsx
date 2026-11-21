import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { ConfirmSheet, Sheet, useToast } from '@/components/overlays';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Badge, Button, Card, Divider, EmptyState, Field, Row, Tap, Txt } from '@/components/ui';
import { useApp } from '@/store/AppStore';
import { useEngagement } from '@/store/engagement';
import { colors, space } from '@/theme';

const COLORS = ['#1E56B3', '#0B2E6F', '#C2185B', '#E65100', '#2E7D32', '#6A1B9A', '#00838F', '#5D4037'];

export default function Teams() {
  const { t, meId, errText } = useApp();
  const { teams, createTeam, joinTeam, leaveTeam } = useEngagement();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [code, setCode] = useState('');
  const [leaveId, setLeaveId] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('teamsTitle')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.lg, paddingBottom: space.xxl }}>
        <Row gap={space.sm}>
          <Button title={t('createTeam')} icon="add" onPress={() => setCreateOpen(true)} style={{ flex: 1 }} small />
          <Button title={t('joinTeam')} icon="key-outline" kind="secondary" onPress={() => setJoinOpen(true)} style={{ flex: 1 }} small />
        </Row>
        {teams.length === 0 && <EmptyState icon="shirt-outline" title={t('noTeams')} body={t('noTeamsSub')} />}
        {teams.map((tm) => (
          <Card key={tm.id} style={{ gap: space.md }}>
            <Row gap={space.md}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: tm.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shirt" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="h3">{tm.name}</Txt>
                <Txt v="tiny" color={colors.textMuted}>
                  {t('members', { n: tm.members.length })}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt v="tiny" color={colors.textMuted}>
                  {t('teamCode')}
                </Txt>
                <Txt v="h3" color={colors.primary} style={{ letterSpacing: 2 }} selectable>
                  {tm.code}
                </Txt>
              </View>
            </Row>
            <Divider />
            {tm.members.map((m) => (
              <Row key={m.id} gap={space.sm}>
                <Avatar name={m.name || '?'} size={30} color={colors.accentDark} />
                <Txt v="body" style={{ flex: 1 }}>
                  {m.id === meId ? t('you') : m.name}
                </Txt>
                {m.id === tm.captainId && <Badge label={t('captain')} icon="star" color={colors.warning} bg={colors.warningSoft} />}
              </Row>
            ))}
            <Row gap={space.sm}>
              <Button
                title={t('shareCode')}
                small
                icon="logo-whatsapp"
                style={{ flex: 1 }}
                onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${t('appName')} — ${tm.name}: ${t('teamCode')} ${tm.code}`)}`).catch(() => {})}
              />
              <Button title={t('leaveTeam')} small kind="danger" style={{ flex: 1 }} onPress={() => setLeaveId(tm.id)} />
            </Row>
          </Card>
        ))}
      </ScrollView>

      <Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title={t('createTeam')}>
        <View style={{ gap: space.lg }}>
          <Field label={t('teamName')} placeholder={t('teamNamePlaceholder')} value={name} onChangeText={setName} maxLength={40} />
          <View style={{ gap: 6 }}>
            <Txt v="label" color={colors.textMuted}>{t('teamColor')}</Txt>
            <Row gap={10} wrap>
              {COLORS.map((c) => (
                <Tap key={c} onPress={() => setColor(c)} accessibilityState={{ selected: color === c }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 3, borderColor: color === c ? colors.accent : 'transparent' }} />
              ))}
            </Row>
          </View>
          <Button
            title={t('save')}
            disabled={name.trim().length < 2}
            onPress={async () => {
              const r = await createTeam(name.trim(), color);
              if (!r.ok) return toast(errText(r.error), 'error');
              setCreateOpen(false);
              setName('');
              toast(t('teamCreated'));
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={joinOpen} onClose={() => setJoinOpen(false)} title={t('joinTeam')}>
        <View style={{ gap: space.lg }}>
          <Field label={t('teamCode')} placeholder={t('teamCodePlaceholder')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={6} />
          <Button
            title={t('confirm')}
            disabled={code.trim().length !== 6}
            onPress={async () => {
              const r = await joinTeam(code);
              if (!r.ok) return toast(errText(r.error), 'error');
              setJoinOpen(false);
              setCode('');
              toast(t('teamJoined'));
            }}
          />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={!!leaveId}
        onClose={() => setLeaveId(null)}
        title={t('leaveTeam')}
        confirmLabel={t('leaveTeam')}
        cancelLabel={t('back')}
        danger
        onConfirm={async () => {
          const id = leaveId!;
          setLeaveId(null);
          const r = await leaveTeam(id);
          toast(r.ok ? t('teamLeft') : errText(r.error), r.ok ? 'info' : 'error');
        }}
      />
    </View>
  );
}
