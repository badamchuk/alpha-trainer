import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { getUserProfile } from '../services/storage';
import { Colors } from '../constants/theme';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    async function checkOnboarding() {
      const profile = await getUserProfile();
      if (profile?.onboardingComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }
    checkOnboarding();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );
}
