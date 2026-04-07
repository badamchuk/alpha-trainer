import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// expo-notifications remote push is unavailable in Expo Go (SDK 53+)
const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestPermissions(): Promise<boolean> {
  if (isExpoGo) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('workouts', {
      name: 'Тренування',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function cancelWorkoutReminders(): Promise<void> {
  if (isExpoGo) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.identifier.startsWith('workout-reminder-')) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

export async function scheduleWorkoutReminders(
  workoutDays: number[], // 0=Sun, 1=Mon, etc.
  reminderHour = 8,
  reminderMinute = 0
): Promise<void> {
  // Cancel existing workout reminders
  await cancelWorkoutReminders();

  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const messages = [
    'Час тренуватися! Ти вже на шляху до своїх цілей.',
    'Сьогодні день тренування! Не пропускай.',
    'Тренування запланове на сьогодні. Вперед!',
    'AlphaTrainer чекає на твої результати сьогодні!',
  ];

  for (const day of workoutDays) {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    await Notifications.scheduleNotificationAsync({
      identifier: `workout-reminder-${day}`,
      content: {
        title: 'AlphaTrainer - Час тренуватися!',
        body: msg,
        data: { type: 'workout_reminder', day },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: day === 0 ? 1 : day + 1, // expo uses 1=Sun, 2=Mon, etc.
        hour: reminderHour,
        minute: reminderMinute,
      },
    });
  }
}

export async function scheduleOneTimeReminder(
  title: string,
  body: string,
  triggerDate: Date
): Promise<string> {
  if (isExpoGo) return '';
  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
  return id;
}
