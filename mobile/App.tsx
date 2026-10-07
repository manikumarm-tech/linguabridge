import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Chat } from './src/screens/Chat';
import { Home } from './src/screens/Home';
import { NewConversation } from './src/screens/NewConversation';
import { Onboarding } from './src/screens/Onboarding';
import { Settings } from './src/screens/Settings';
import { useApp } from './src/store/app';
import { useTheme } from './src/theme';

export type RootStack = {
  Home: undefined;
  NewConversation: undefined;
  Chat: { conversationId: string; peerName: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStack>();

export default function App() {
  const t = useTheme();
  const { ready, user, hydrate } = useApp();
  useEffect(() => { hydrate(); }, [hydrate]);

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator color={t.primary} /></View>;

  const base = t.bg === '#0E1016' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: t.bg, card: t.card, text: t.text, border: t.border, primary: t.primary } };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {!user ? (
        <Onboarding />
      ) : (
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator>
            <Stack.Screen name="Home" component={Home} options={{ headerShown: false }} />
            <Stack.Screen name="NewConversation" component={NewConversation} options={{ title: 'New Conversation' }} />
            <Stack.Screen name="Chat" component={Chat} options={{ title: '' }} />
            <Stack.Screen name="Settings" component={Settings} />
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
