import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getUserProfile } from '../services/storage';
import { initGemini } from '../services/gemini';
import { initGroq } from '../services/groq';
import { requestPermissions } from '../services/notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      const profile = await getUserProfile();
      if (profile?.geminiApiKey) initGemini(profile.geminiApiKey);
      if (profile?.groqApiKey) initGroq(profile.groqApiKey);
      await requestPermissions();
    }
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0D0D0D" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0D0D0D' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="workout/log" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="workout/[id]" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
