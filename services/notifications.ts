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

export async function cancelWaterReminders(): Promise<void> {
  if (isExpoGo) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.identifier.startsWith('water-reminder-')) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

/**
 * Schedules daily water reminders spread evenly between startHour and endHour.
 * @param glasses   total glasses goal per day
 * @param startHour first reminder hour (default 8)
 * @param endHour   last reminder hour (default 22)
 */
export async function scheduleWaterReminders(
  glasses: number,
  startHour = 8,
  endHour = 22
): Promise<void> {
  if (isExpoGo) return;
  await cancelWaterReminders();

  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('water', {
      name: 'Водний баланс',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150],
    });
  }

  const messages = [
    'Час випити склянку води 💧',
    'Не забувай про воду — твоє тіло дякує 💧',
    'Підтримуй водний баланс — випий склянку зараз 💧',
    'Вода = енергія. Час зробити ковток! 💧',
    'Гідратація — ключ до продуктивності 💧',
    'Склянка води прямо зараз! 💧',
  ];

  // Spread reminders evenly: glasses notifications between startHour and endHour
  const totalMinutes = (endHour - startHour) * 60;
  const intervalMinutes = glasses > 1 ? totalMinutes / (glasses - 1) : totalMinutes;

  for (let i = 0; i < glasses; i++) {
    const offsetMinutes = Math.round(i * intervalMinutes);
    const hour = startHour + Math.floor(offsetMinutes / 60);
    const minute = offsetMinutes % 60;
    const msg = messages[i % messages.length];

    await Notifications.scheduleNotificationAsync({
      identifier: `water-reminder-${i}`,
      content: {
        title: 'AlphaTrainer — Вода',
        body: msg,
        data: { type: 'water_reminder' },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'water' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
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
