import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getUserProfile } from '../services/storage';
import { initGemini } from '../services/gemini';
import { initGroq } from '../services/groq';
import { requestPermissions } from '../services/notifications';
import { loadLanguage } from '../services/i18n';
import { promptIfUpdateAvailable } from '../services/updates';
import { autoBackup } from '../services/backup';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      await loadLanguage();
      const profile = await getUserProfile();
      if (profile?.geminiApiKey) initGemini(profile.geminiApiKey);
      if (profile?.groqApiKey) initGroq(profile.groqApiKey);
      await requestPermissions();
      // після дозволів — щоб діалог оновлення не наліз на системний
      promptIfUpdateAvailable();
      // тиха копія даних раз на тиждень; помилки проковтуються всередині
      autoBackup();
    }
    init();

    // Повернувся в додаток — перевірити знову. Частіше ніж раз на 6 годин
    // сервіс у мережу не ходить, тож це дешево.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') promptIfUpdateAvailable();
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0D0D0D" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0D0D0D' },
          // 'fade_from_bottom' є плавнішою на Android ніж slide_from_right
          animation: 'fade_from_bottom',
          animationDuration: 200,
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
