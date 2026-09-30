import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform, Animated, type ColorValue } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/lib/theme';
import { Spring } from '@/lib/motion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type TabConfig = {
  name: string;
  label: string;
  icon: IoniconName;
  iconFilled: IoniconName;
};

const TABS: TabConfig[] = [
  { name: 'index',    label: 'Home',    icon: 'home-outline',      iconFilled: 'home'        },
  { name: 'search',   label: 'Search',  icon: 'search-outline',    iconFilled: 'search'      },
  { name: 'messages', label: 'Messages',icon: 'chatbubble-outline',iconFilled: 'chatbubble' },
  { name: 'profile',  label: 'Profile', icon: 'person-outline',    iconFilled: 'person'      },
];

type TabBarIconProps = { focused: boolean; color: ColorValue; size: number };

/** Builds a stable per-tab icon component that pops slightly when it becomes active. */
function createTabIcon({ icon, iconFilled }: TabConfig) {
  return function TabIcon({ focused, color }: TabBarIconProps) {
    const [scale] = useState(() => new Animated.Value(1));
    const wasFocused = useRef(focused);

    useEffect(() => {
      if (focused === wasFocused.current) return;
      wasFocused.current = focused;
      Animated.spring(scale, {
        toValue: focused ? 1.15 : 1,
        ...Spring.gentle,
        useNativeDriver: true,
      }).start();
    }, [focused, scale]);

    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={focused ? iconFilled : icon}
          size={26}
          color={color}
          style={focused ? styles.activeGlow : undefined}
        />
      </Animated.View>
    );
  };
}

// Created once at module scope so tab icon components keep a stable identity
// and their animation state survives re-renders.
const TAB_SCREENS = TABS.map((tab) => ({ ...tab, TabIcon: createTabIcon(tab) }));

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
      {TAB_SCREENS.map(({ name, label, TabIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarIcon: TabIcon,
            tabBarAccessibilityLabel: label,
          }}
        />
      ))}
      {/* Upload screen — accessible via router.push but hidden from tab bar */}
      <Tabs.Screen
        name="upload"
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
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
