import { View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { Icon, type IconName } from '../../components/Icon';
import { S } from '../../i18n';
import { FONT, RADII, useTheme } from '../../theme';

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  const t = useTheme();
  // Aktif sekmede dolgu yok, gösterge hapı var.
  return (
    <View style={{ width: 56, height: 30, borderRadius: RADII.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? t.c.surf2 : 'transparent' }}>
      <Icon name={name} color={color} size={22} />
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const tab = (name: IconName) => ({ focused }: { focused: boolean }) => <TabIcon name={name} focused={focused} color={focused ? t.c.ink : t.c.ink3} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.c.ink,
        tabBarInactiveTintColor: t.c.ink3,
        tabBarStyle: { backgroundColor: t.c.surf, borderTopColor: t.c.line },
        tabBarLabelStyle: { fontFamily: FONT.semibold, fontSize: 12 },
        sceneStyle: { backgroundColor: t.c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: S.tabs.map, tabBarIcon: tab('map'), tabBarAccessibilityLabel: S.tabs.map }} />
      <Tabs.Screen name="league" options={{ title: S.tabs.league, tabBarIcon: tab('league'), tabBarAccessibilityLabel: S.tabs.league }} />
      <Tabs.Screen name="team" options={{ title: S.tabs.team, tabBarIcon: tab('team'), tabBarAccessibilityLabel: S.tabs.team }} />
      <Tabs.Screen name="events" options={{ title: S.tabs.events, tabBarIcon: tab('events'), tabBarAccessibilityLabel: S.tabs.events }} />
    </Tabs>
  );
}
