import { Ionicons } from '@expo/vector-icons';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, haptic, type IconName } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useApp } from '@/store/AppStore';
import { colors } from '@/theme';

const TABS: Record<string, { icon: IconName; iconActive: IconName; label: StringKey }> = {
  index: { icon: 'home-outline', iconActive: 'home', label: 'tabHome' },
  pitches: { icon: 'map-outline', iconActive: 'map', label: 'tabPitches' },
  matches: { icon: 'football-outline', iconActive: 'football', label: 'tabMatches' },
  tournaments: { icon: 'trophy-outline', iconActive: 'trophy', label: 'tabTournaments' },
  profile: { icon: 'person-outline', iconActive: 'person', label: 'tabProfile' },
};

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { t, isRTL } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        backgroundColor: colors.card,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {state.routes.map((route, index) => {
        const cfg = TABS[route.name];
        if (!cfg) return null;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              if (!focused) {
                haptic.select();
                navigateToTab(route.key);
              }
            }}
            style={{ flex: 1, alignItems: 'center', gap: 2 }}
          >
            <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: 16, backgroundColor: focused ? colors.primarySoft : 'transparent' }}>
              <Ionicons name={focused ? cfg.iconActive : cfg.icon} size={22} color={focused ? colors.primary : colors.textFaint} />
            </View>
            <Txt v="tiny" color={focused ? colors.primary : colors.textFaint} center>
              {t(cfg.label)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="pitches" />
      <Tabs.Screen name="matches" />
      <Tabs.Screen name="tournaments" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
