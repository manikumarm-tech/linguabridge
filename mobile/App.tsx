import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Chat } from './src/screens/Chat';
import { Home } from './src/screens/Home';
import { NewConversation } from './src/screens/NewConversation';
import { Onboarding } from './src/screens/Onboarding';
import { Settings } from './src/screens/Settings';
import { WelcomeBackdrop } from './src/components/WelcomeBackdrop';
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

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.screen }}><ActivityIndicator color={t.primary} /></View>;

  const base = t.bg === '#0E1016' ? DarkTheme : DefaultTheme;
  const web = Platform.OS === 'web';
  const navTheme = { ...base, colors: { ...base.colors, background: t.screen, card: web ? 'transparent' : t.card, text: t.text, border: t.border, primary: t.primary } };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {!user ? (
        <Onboarding />
      ) : (
        <>
        {web && <WelcomeBackdrop trail={false} />}
        <View style={web ? {
          flex: 1, width: '100%', maxWidth: 880, alignSelf: 'center', zIndex: 1, backgroundColor: t.glass,
          borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(14px)',
        } as any : { flex: 1 }}>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={({ navigation }) => ({
              // always offer a way back, even when the screen was opened directly (web refresh) and has no history
              headerLeft: () => (
                <Pressable
                  accessibilityLabel="Back" hitSlop={12} style={{ paddingRight: 16, marginLeft: Platform.OS === 'web' ? 16 : 0 }}
                  onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
                >
                  <Text style={{ color: t.text, fontSize: 24 }}>←</Text>
                </Pressable>
              ),
            })}
          >
            <Stack.Screen name="Home" component={Home} options={{ headerShown: false }} />
            <Stack.Screen name="NewConversation" component={NewConversation} options={{ title: 'Add friend' }} />
            <Stack.Screen name="Chat" component={Chat} options={{ title: '' }} />
            <Stack.Screen name="Settings" component={Settings} />
          </Stack.Navigator>
        </NavigationContainer>
        </View>
        </>
      )}
    </SafeAreaProvider>
  );
}
