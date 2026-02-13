/**
 * Root layout — Expo Router tab navigator.
 *
 * Two tabs: Chat (index) and Settings.
 */

import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#e0e0e0',
          tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#333' },
          tabBarActiveTintColor: '#6c63ff',
          tabBarInactiveTintColor: '#888',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Chat', tabBarLabel: 'Chat' }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', tabBarLabel: 'Settings' }}
        />
      </Tabs>
    </>
  );
}

