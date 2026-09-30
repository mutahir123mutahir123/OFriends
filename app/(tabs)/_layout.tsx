import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type TabConfig = {
  name: string;
  icon: IoniconName;
  iconFilled: IoniconName;
};

const TABS: TabConfig[] = [
  { name: 'index',    icon: 'home-outline',       iconFilled: 'home'           },
  { name: 'search',   icon: 'search-outline',     iconFilled: 'search'         },
  { name: 'reels',    icon: 'film-outline',        iconFilled: 'film'           },
  { name: 'messages', icon: 'chatbubble-outline',  iconFilled: 'chatbubble'    },
  { name: 'profile',  icon: 'person-outline',      iconFilled: 'person'        },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.onSurfaceVariant,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.tabBarAndroid]} />
          ),
      }}
    >
      {TABS.map(({ name, icon, iconFilled }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? iconFilled : icon}
                size={26}
                color={color}
                style={focused ? styles.activeGlow : undefined}
              />
            ),
          }}
        />
      ))}
      {/* Upload screen — accessible via router.push but hidden from tab bar */}
      <Tabs.Screen
        name="upload"
        options={{ tabBarButton: () => null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    elevation: 0,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    backgroundColor: 'transparent',
  },
  tabBarAndroid: {
    backgroundColor: 'rgba(13,13,13,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  activeGlow: {
    // subtle glow on active icons via shadow
    textShadowColor: Colors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
