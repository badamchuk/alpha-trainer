import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Switch, KeyboardAvoidingView, Platform,
  Animated, Dimensions, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { getUserProfile, saveUserProfile } from '../../services/storage';
import { initGemini, verifyApiKey } from '../../services/gemini';
import { initGroq, verifyGroqApiKey } from '../../services/groq';
import { scheduleWorkoutReminders, scheduleWaterReminders } from '../../services/notifications';
import { computeWaterGoal, setWaterGoal } from '../../services/water';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../../types';
import { loadLanguage, setLanguage, useLocale, Lang } from '../../services/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FITNESS_LEVELS = [
  { id: 'beginner', label: 'Початківець', desc: 'Менше 6 місяців', icon: 'walk-outline' },
  { id: 'intermediate', label: 'Середній', desc: '6–24 місяці', icon: 'bicycle-outline' },
  { id: 'advanced', label: 'Просунутий', desc: 'Більше 2 років', icon: 'barbell-outline' },
];

const WEEK_DAYS = [
  { id: 1, label: 'Пн' }, { id: 2, label: 'Вт' }, { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' }, { id: 5, label: 'Пт' }, { id: 6, label: 'Сб' }, { id: 0, label: 'Нд' },
];

const EQUIPMENT_OPTIONS = [
  { id: 'Штанга', icon: 'barbell-outline' },
  { id: 'Гантелі', icon: 'fitness-outline' },
  { id: 'Турнік', icon: 'hand-right-outline' },
  { id: 'Брусся', icon: 'git-branch-outline' },
  { id: 'Гирі', icon: 'golf-outline' },
  { id: 'Еспандер', icon: 'infinite-outline' },
  { id: 'Тренажерний зал', icon: 'business-outline' },
  { id: 'Бігова доріжка', icon: 'walk-outline' },
  { id: 'Скакалка', icon: 'swap-vertical-outline' },
  { id: 'Лише власна вага', icon: 'body-outline' },
];

const TOTAL_STEPS = 7;

export default function OnboardingScreen() {
  const router = useRouter();
  const { lang, t, setLanguage: changeLang } = useLocale();
  const [step, setStep] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Form state
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState<UserProfile['fitnessLevel']>('beginner');
  const [availableDays, setAvailableDays] = useState<number[]>([1, 3, 5]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyVerified, setKeyVerified] = useState(false);
  const [groqKeyVerified, setGroqKeyVerified] = useState(false);
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [reminderHour, setReminderHour] = useState('08');
  const [reminderMinute, setReminderMinute] = useState('00');

  useEffect(() => {
    async function load() {
      await loadLanguage();
      const profile = await getUserProfile();
      if (profile) {
        setIsEditing(true);
        setName(profile.name);
        setAge(profile.age.toString());
        setWeight(profile.weight.toString());
        setHeight(profile.height.toString());
        setFitnessLevel(profile.fitnessLevel);
        setAvailableDays(profile.availableDays);
        setEquipment(profile.equipment);
        setGeminiKey(profile.geminiApiKey || '');
        setGroqKey(profile.groqApiKey || '');
        if (profile.geminiApiKey) setKeyVerified(true);
        if (profile.groqApiKey) setGroqKeyVerified(true);
      }
    }
    load();
  }, []);

  function animateToStep(nextStep: number) {
    const direction = nextStep > step ? 1 : -1;
    slideAnim.setValue(direction * SCREEN_WIDTH);
    setStep(nextStep);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
  }

  function validateStep(): string | null {
    switch (step) {
      case 0: return null; // welcome
      case 1: return !name.trim() ? "Введи своє ім'я" : null;
      case 2:
        if (!age || isNaN(Number(age)) || Number(age) < 10 || Number(age) > 100) return 'Введи коректний вік (10–100)';
        if (!weight || isNaN(Number(weight)) || Number(weight) < 30) return 'Введи коректну вагу';
        if (!height || isNaN(Number(height)) || Number(height) < 100) return 'Введи коректний зріст';
        return null;
      case 3: return null; // fitness level — always valid
      case 4: return availableDays.length === 0 ? 'Вибери хоча б один день' : null;
      case 5: return null; // equipment — optional
      case 6: return null; // key is optional — can be added later in profile
      default: return null;
    }
  }

  function handleNext() {
    const error = validateStep();
    if (error) { Alert.alert('', error); return; }
    if (step < TOTAL_STEPS - 1) {
      animateToStep(step + 1);
    } else {
      handleSave();
    }
  }

  function handleBack() {
    if (step > 0) animateToStep(step - 1);
    else if (isEditing) router.back();
  }

  async function verifyKey() {
    if (!geminiKey.trim()) { Alert.alert('', 'Вставте ключ'); return; }
    const result = await verifyApiKey(geminiKey.trim());
    if (result.ok) {
      initGemini(geminiKey.trim());
      setKeyVerified(true);
      if (result.error === 'quota_warning') {
        Alert.alert('✓ Ключ дійсний', 'Ліміт моделей вичерпано, але ключ правильний.');
      } else {
        Alert.alert('✓ Ключ працює!', `Модель: ${result.model}\nAI-тренер готовий до роботи`);
      }
    } else {
      setKeyVerified(false);
      Alert.alert('Помилка перевірки', result.error || 'Не вдалося перевірити ключ');
    }
  }

  async function verifyGroqKey() {
    if (!groqKey.trim()) { Alert.alert('', 'Вставте ключ'); return; }
    const result = await verifyGroqApiKey(groqKey.trim());
    if (result.ok) {
      initGroq(groqKey.trim());
      setGroqKeyVerified(true);
      Alert.alert('✓ Ключ працює!', `Модель: ${result.model}\nGroq AI-тренер готовий!`);
    } else {
      setGroqKeyVerified(false);
      Alert.alert('Помилка перевірки', result.error || 'Не вдалося перевірити ключ');
    }
  }

  async function handleSave() {
    const profile: UserProfile = {
      name: name.trim(),
      age: Number(age),
      weight: Number(weight),
      height: Number(height),
      fitnessLevel,
      availableDays,
      equipment,
      geminiApiKey: geminiKey.trim(),
      groqApiKey: groqKey.trim() || undefined,
      onboardingComplete: true,
    };
    await saveUserProfile(profile);
    if (geminiKey.trim()) initGemini(geminiKey.trim());
    if (groqKey.trim()) initGroq(groqKey.trim());
    if (enableNotifications) {
      await scheduleWorkoutReminders(availableDays, Number(reminderHour), Number(reminderMinute));
    }

    // Update water goal based on new profile and reschedule reminders if on
    const waterGoal = computeWaterGoal(profile);
    await setWaterGoal(waterGoal);
    const remindersFlag = await AsyncStorage.getItem('@alpha_trainer:water_reminders');
    if (remindersFlag === 'true') {
      await scheduleWaterReminders(waterGoal);
    }

    router.replace('/(tabs)');
  }

  function toggleDay(day: number) {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleEquipment(item: string) {
    setEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  const isLastStep = step === TOTAL_STEPS - 1;
  const progress = (step / (TOTAL_STEPS - 1)) * 100;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            {(step > 0 || isEditing) && (
              <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
          <Text style={styles.stepIndicator}>{step + 1} / {TOTAL_STEPS}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        {/* Step content */}
        <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 0 && <StepWelcome lang={lang} onLangChange={changeLang} />}
            {step === 1 && <StepName name={name} setName={setName} />}
            {step === 2 && (
              <StepBody age={age} setAge={setAge} weight={weight} setWeight={setWeight}
                height={height} setHeight={setHeight} />
            )}
            {step === 3 && (
              <StepFitnessLevel value={fitnessLevel} onChange={setFitnessLevel} />
            )}
            {step === 4 && (
              <StepDays days={availableDays} toggle={toggleDay} />
            )}
            {step === 5 && (
              <StepEquipment selected={equipment} toggle={toggleEquipment} />
            )}
            {step === 6 && (
              <StepGemini
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
                groqKey={groqKey}
                setGroqKey={setGroqKey}
                showKey={showKey}
                setShowKey={setShowKey}
                keyVerified={keyVerified}
                setKeyVerified={setKeyVerified}
                groqKeyVerified={groqKeyVerified}
                setGroqKeyVerified={setGroqKeyVerified}
                verifyKey={verifyKey}
                verifyGroqKey={verifyGroqKey}
                enableNotifications={enableNotifications}
                setEnableNotifications={setEnableNotifications}
                reminderHour={reminderHour}
                setReminderHour={setReminderHour}
                reminderMinute={reminderMinute}
                setReminderMinute={setReminderMinute}
                name={name}
              />
            )}
          </ScrollView>
        </Animated.View>

        {/* Next button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>
              {step === 0 ? t('next') : isLastStep ? t('done') : t('next')}
            </Text>
            <Ionicons
              name={isLastStep ? 'checkmark-circle-outline' : 'arrow-forward'}
              size={20}
              color="#FFF"
            />
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

// ─── STEPS ────────────────────────────────────────────────────────────────────

function StepWelcome({ lang, onLangChange }: { lang: Lang; onLangChange: (l: Lang) => void }) {
  return (
    <View style={styles.stepContent}>
      {/* Language picker */}
      <View style={styles.langPicker}>
        <TouchableOpacity
          style={[styles.langBtn, lang === 'uk' && styles.langBtnActive]}
          onPress={() => onLangChange('uk')}
        >
          <Text style={[styles.langBtnText, lang === 'uk' && styles.langBtnTextActive]}>🇺🇦 Українська</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
          onPress={() => onLangChange('en')}
        >
          <Text style={[styles.langBtnText, lang === 'en' && styles.langBtnTextActive]}>🇬🇧 English</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.bigIcon}>
        <Ionicons name="barbell-outline" size={52} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Ласкаво просимо до{'\n'}AlphaTrainer</Text>
      <Text style={styles.stepDesc}>
        Персональний AI-тренер, який будує план спеціально під тебе.{'\n\n'}
        Пройди 7 простих кроків щоб налаштувати додаток — це займе лише 2 хвилини.
      </Text>
      <View style={styles.featureList}>
        {[
          { icon: 'calendar-outline', text: 'Персональний план тренувань' },
          { icon: 'chatbubble-ellipses-outline', text: 'AI-тренер відповідає на питання' },
          { icon: 'stats-chart-outline', text: 'Відстеження прогресу та статистика' },
          { icon: 'notifications-outline', text: 'Нагадування про тренування' },
        ].map((f) => (
          <View key={f.icon} style={styles.featureItem}>
            <Ionicons name={f.icon as any} size={18} color={Colors.primary} />
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepName({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.stepIcon}>
        <Ionicons name="person-outline" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Як тебе звати?</Text>
      <Text style={styles.stepDesc}>AI-тренер буде звертатися до тебе по імені</Text>
      <TextInput
        style={styles.bigInput}
        placeholder="Твоє ім'я"
        placeholderTextColor={Colors.textMuted}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
      />
    </View>
  );
}

function StepBody({ age, setAge, weight, setWeight, height, setHeight }: {
  age: string; setAge: (v: string) => void;
  weight: string; setWeight: (v: string) => void;
  height: string; setHeight: (v: string) => void;
}) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.stepIcon}>
        <Ionicons name="body-outline" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Твої параметри</Text>
      <Text style={styles.stepDesc}>Потрібно для розрахунку навантаження і норм</Text>
      <View style={styles.metricsGrid}>
        <MetricInput label="Вік" unit="років" value={age} onChange={setAge} placeholder="25" />
        <MetricInput label="Вага" unit="кг" value={weight} onChange={setWeight} placeholder="75" />
        <MetricInput label="Зріст" unit="см" value={height} onChange={setHeight} placeholder="175" />
      </View>
    </View>
  );
}

function MetricInput({ label, unit, value, onChange, placeholder }: {
  label: string; unit: string; value: string;
  onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <TextInput
        style={styles.metricInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType="decimal-pad"
        textAlign="center"
      />
      <Text style={styles.metricUnit}>{unit}</Text>
    </View>
  );
}

function StepFitnessLevel({ value, onChange }: {
  value: string; onChange: (v: UserProfile['fitnessLevel']) => void;
}) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.stepIcon}>
        <Ionicons name="trophy-outline" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Рівень підготовки</Text>
      <Text style={styles.stepDesc}>Будемо чесними — від цього залежить інтенсивність</Text>
      {FITNESS_LEVELS.map((l) => (
        <TouchableOpacity
          key={l.id}
          style={[styles.levelCard, value === l.id && styles.levelCardActive]}
          onPress={() => onChange(l.id as UserProfile['fitnessLevel'])}
        >
          <View style={[styles.levelIcon, value === l.id && styles.levelIconActive]}>
            <Ionicons name={l.icon as any} size={22} color={value === l.id ? Colors.primary : Colors.textMuted} />
          </View>
          <View style={styles.levelText}>
            <Text style={[styles.levelTitle, value === l.id && { color: Colors.primary }]}>{l.label}</Text>
            <Text style={styles.levelDesc}>{l.desc}</Text>
          </View>
          {value === l.id && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StepDays({ days, toggle }: { days: number[]; toggle: (d: number) => void }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.stepIcon}>
        <Ionicons name="calendar-outline" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Коли тренуєшся?</Text>
      <Text style={styles.stepDesc}>Вибери дні — AI побудує план саме під твій розклад</Text>
      <View style={styles.daysGrid}>
        {WEEK_DAYS.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.dayCard, days.includes(d.id) && styles.dayCardActive]}
            onPress={() => toggle(d.id)}
          >
            <Text style={[styles.dayLabel, days.includes(d.id) && styles.dayLabelActive]}>{d.label}</Text>
            {days.includes(d.id) && (
              <View style={styles.dayCheck}>
                <Ionicons name="checkmark" size={10} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.daysCount}>
        {days.length > 0
          ? `Вибрано ${days.length} ${days.length === 1 ? 'день' : days.length < 5 ? 'дні' : 'днів'} на тиждень`
          : 'Вибери хоча б один день'}
      </Text>
    </View>
  );
}

function StepEquipment({ selected, toggle }: { selected: string[]; toggle: (e: string) => void }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.stepIcon}>
        <Ionicons name="fitness-outline" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>Що є для тренувань?</Text>
      <Text style={styles.stepDesc}>AI підбере вправи під твоє обладнання</Text>
      <View style={styles.equipGrid}>
        {EQUIPMENT_OPTIONS.map((e) => (
          <TouchableOpacity
            key={e.id}
            style={[styles.equipCard, selected.includes(e.id) && styles.equipCardActive]}
            onPress={() => toggle(e.id)}
          >
            <Ionicons
              name={e.icon as any}
              size={20}
              color={selected.includes(e.id) ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.equipLabel, selected.includes(e.id) && { color: Colors.primary }]}>
              {e.id}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function StepGemini({
  geminiKey, setGeminiKey, groqKey, setGroqKey,
  showKey, setShowKey,
  keyVerified, setKeyVerified, groqKeyVerified, setGroqKeyVerified,
  verifyKey, verifyGroqKey,
  enableNotifications, setEnableNotifications,
  reminderHour, setReminderHour, reminderMinute, setReminderMinute,
  name,
}: any) {
  const [provider, setProvider] = useState<'groq' | 'gemini'>('groq');
  const [apiStep, setApiStep] = useState(0);

  const GROQ_STEPS = [
    {
      num: '1', title: 'Відкрий Groq Console',
      desc: 'Натисни кнопку — відкриється сайт Groq. Реєстрація безкоштовна',
      action: (
        <TouchableOpacity style={styles.openBrowserBtn} onPress={() => { Linking.openURL('https://console.groq.com/keys'); setApiStep(1); }}>
          <Ionicons name="open-outline" size={18} color="#FFF" />
          <Text style={styles.openBrowserBtnText}>Відкрити console.groq.com</Text>
        </TouchableOpacity>
      ),
    },
    {
      num: '2', title: 'Зареєструйся або увійди',
      desc: 'Можна через Google або email — це безкоштовно',
      action: (
        <TouchableOpacity style={styles.doneStepBtn} onPress={() => setApiStep(2)}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
          <Text style={[styles.doneStepBtnText, { color: Colors.success }]}>Залогінився</Text>
        </TouchableOpacity>
      ),
    },
    {
      num: '3', title: 'Натисни "Create API Key"',
      desc: 'Вибери назву (наприклад "AlphaTrainer") і натисни "Submit"',
      action: (
        <TouchableOpacity style={styles.doneStepBtn} onPress={() => setApiStep(3)}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
          <Text style={[styles.doneStepBtnText, { color: Colors.success }]}>Створив</Text>
        </TouchableOpacity>
      ),
    },
    {
      num: '4', title: 'Скопіюй ключ',
      desc: 'Ключ починається на "gsk_..." — скопіюй його одразу, він показується лише раз',
      action: (
        <TouchableOpacity style={styles.doneStepBtn} onPress={() => setApiStep(4)}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
          <Text style={[styles.doneStepBtnText, { color: Colors.success }]}>Скопіював</Text>
        </TouchableOpacity>
      ),
    },
    { num: '5', title: 'Встав ключ нижче', desc: 'Встав скопійований ключ і натисни "Перевірити"', action: null },
  ];

  const GEMINI_STEPS = [
    {
      num: '1', title: 'Відкрий Google AI Studio',
      desc: 'Натисни кнопку — відкриється сайт Google де безкоштовно видають ключ',
      action: (
        <TouchableOpacity style={styles.openBrowserBtn} onPress={() => { Linking.openURL('https://aistudio.google.com/apikey'); setApiStep(1); }}>
          <Ionicons name="open-outline" size={18} color="#FFF" />
          <Text style={styles.openBrowserBtnText}>Відкрити Google AI Studio</Text>
        </TouchableOpacity>
      ),
    },
    {
      num: '2', title: 'Увійди в Google акаунт',
      desc: 'Якщо ще не залогінений — увійди через Gmail',
      action: (
        <TouchableOpacity style={styles.doneStepBtn} onPress={() => setApiStep(2)}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
          <Text style={[styles.doneStepBtnText, { color: Colors.success }]}>Залогінився</Text>
        </TouchableOpacity>
      ),
    },
    {
      num: '3', title: 'Натисни "Create API key"',
      desc: 'Велика синя кнопка на сторінці',
      action: (
        <TouchableOpacity style={styles.doneStepBtn} onPress={() => setApiStep(3)}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
          <Text style={[styles.doneStepBtnText, { color: Colors.success }]}>Натиснув</Text>
        </TouchableOpacity>
      ),
    },
    {
      num: '4', title: 'Скопіюй ключ',
      desc: 'Ключ починається на "AIza..." — натисни щоб скопіювати',
      action: (
        <TouchableOpacity style={styles.doneStepBtn} onPress={() => setApiStep(4)}>
          <Ionicons name="checkmark" size={16} color={Colors.success} />
          <Text style={[styles.doneStepBtnText, { color: Colors.success }]}>Скопіював</Text>
        </TouchableOpacity>
      ),
    },
    { num: '5', title: 'Встав ключ нижче', desc: 'Встав скопійований ключ і натисни "Перевірити"', action: null },
  ];

  const steps = provider === 'groq' ? GROQ_STEPS : GEMINI_STEPS;
  const currentKey = provider === 'groq' ? groqKey : geminiKey;
  const setCurrentKey = (t: string) => {
    if (provider === 'groq') { setGroqKey(t); setGroqKeyVerified(false); }
    else { setGeminiKey(t); setKeyVerified(false); }
  };
  const isVerified = provider === 'groq' ? groqKeyVerified : keyVerified;
  const doVerify = provider === 'groq' ? verifyGroqKey : verifyKey;
  const placeholder = provider === 'groq' ? 'gsk_...' : 'AIzaSy...';

  return (
    <View style={styles.stepContent}>
      <View style={styles.stepIcon}>
        <Ionicons name="sparkles" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>
        {name ? `${name}, підключи AI-тренера` : 'Підключи AI-тренера'}
      </Text>

      {/* Provider toggle */}
      <View style={styles.providerToggle}>
        <TouchableOpacity
          style={[styles.providerBtn, provider === 'groq' && styles.providerBtnActive]}
          onPress={() => { setProvider('groq'); setApiStep(0); }}
        >
          <Text style={[styles.providerBtnText, provider === 'groq' && styles.providerBtnTextActive]}>
            Groq
          </Text>
          <Text style={[styles.providerBtnSub, provider === 'groq' && { color: Colors.primary }]}>
            Рекомендовано
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.providerBtn, provider === 'gemini' && styles.providerBtnActive]}
          onPress={() => { setProvider('gemini'); setApiStep(0); }}
        >
          <Text style={[styles.providerBtnText, provider === 'gemini' && styles.providerBtnTextActive]}>
            Gemini
          </Text>
          <Text style={[styles.providerBtnSub, provider === 'gemini' && { color: Colors.primary }]}>
            Google AI
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.stepDesc}>
        {provider === 'groq'
          ? 'Groq — безкоштовний і швидкий AI. 6000 запитів/день, реєстрація через Google'
          : 'Gemini від Google. Безкоштовний ліміт може вичерпатись швидше'}
      </Text>

      {/* Step-by-step */}
      <View style={styles.apiStepsList}>
        {steps.map((s, i) => (
          <View key={i} style={[styles.apiStep, i > apiStep && styles.apiStepDisabled]}>
            <View style={[
              styles.apiStepNum,
              i < apiStep && styles.apiStepNumDone,
              i === apiStep && styles.apiStepNumActive,
            ]}>
              {i < apiStep
                ? <Ionicons name="checkmark" size={14} color="#FFF" />
                : <Text style={[styles.apiStepNumText, i === apiStep && { color: Colors.primary }]}>{s.num}</Text>
              }
            </View>
            <View style={styles.apiStepBody}>
              <Text style={[styles.apiStepTitle, i > apiStep && { color: Colors.textMuted }]}>{s.title}</Text>
              {i === apiStep && (
                <>
                  <Text style={styles.apiStepDesc}>{s.desc}</Text>
                  {s.action}
                </>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Key input */}
      {apiStep >= 3 && (
        <View style={styles.keySection}>
          <View style={styles.keyInputRow}>
            <TextInput
              style={[styles.keyInput, isVerified && styles.keyInputVerified]}
              placeholder={placeholder}
              placeholderTextColor={Colors.textMuted}
              value={currentKey}
              onChangeText={setCurrentKey}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowKey(!showKey)}>
              <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {!isVerified ? (
            <TouchableOpacity style={styles.verifyBtn} onPress={doVerify}>
              <Text style={styles.verifyBtnText}>Перевірити ключ</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.verifiedText}>Ключ підтверджено — AI готовий!</Text>
            </View>
          )}
        </View>
      )}

      {/* Notifications */}
      <View style={styles.notifSection}>
        <View style={styles.notifRow}>
          <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.notifLabel}>Нагадування про тренування</Text>
          <Switch
            value={enableNotifications}
            onValueChange={setEnableNotifications}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor="#FFF"
          />
        </View>
        {enableNotifications && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Час нагадування:</Text>
            <TextInput style={styles.timeInput} value={reminderHour} onChangeText={setReminderHour} keyboardType="numeric" maxLength={2} />
            <Text style={styles.timeSep}>:</Text>
            <TextInput style={styles.timeInput} value={reminderMinute} onChangeText={setReminderMinute} keyboardType="numeric" maxLength={2} />
          </View>
        )}
      </View>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 52, paddingBottom: Spacing.sm,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  stepIndicator: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  progressBar: {
    height: 3, backgroundColor: Colors.border,
    marginHorizontal: Spacing.md, borderRadius: 2, marginBottom: Spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  stepContainer: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: 20 },
  stepContent: { gap: Spacing.md },
  footer: { padding: Spacing.md, paddingBottom: 32 },

  // Next button
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  nextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 17 },

  // Welcome step
  bigIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(230,57,70,0.1)', borderWidth: 2, borderColor: 'rgba(230,57,70,0.3)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  stepIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(230,57,70,0.1)', borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  stepTitle: { ...Typography.h1, fontSize: 26, textAlign: 'center' },
  stepDesc: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  featureList: { gap: Spacing.sm, marginTop: Spacing.sm },
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  featureText: { color: Colors.textSecondary, fontSize: 14 },

  // Language picker
  langPicker: {
    flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, alignSelf: 'center',
  },
  langBtn: {
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.surface,
  },
  langBtnActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  langBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  langBtnTextActive: { color: '#FFF' },

  // Name step
  bigInput: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    color: Colors.textPrimary, fontSize: 22, textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // Body step
  metricsGrid: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  metricCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center', gap: 4,
  },
  metricLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  metricInput: {
    color: Colors.textPrimary, fontSize: 28, fontWeight: '700',
    width: '100%', textAlign: 'center',
  },
  metricUnit: { color: Colors.textMuted, fontSize: 12 },

  // Fitness level
  levelCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  levelCardActive: { borderColor: Colors.primary, backgroundColor: 'rgba(230,57,70,0.05)' },
  levelIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
  },
  levelIconActive: { backgroundColor: 'rgba(230,57,70,0.15)' },
  levelText: { flex: 1 },
  levelTitle: { ...Typography.body, fontWeight: '700' },
  levelDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  // Days
  daysGrid: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  dayCard: {
    width: 52, height: 64, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dayCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayLabel: { color: Colors.textSecondary, fontWeight: '700', fontSize: 15 },
  dayLabelActive: { color: '#FFF' },
  dayCheck: {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  daysCount: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },

  // Equipment
  equipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  equipCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
  },
  equipCardActive: { borderColor: Colors.primary, backgroundColor: 'rgba(230,57,70,0.08)' },
  equipLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },

  // Provider toggle
  providerToggle: {
    flexDirection: 'row', gap: Spacing.sm,
  },
  providerBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center',
  },
  providerBtnActive: { borderColor: Colors.primary, backgroundColor: 'rgba(230,57,70,0.07)' },
  providerBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 15 },
  providerBtnTextActive: { color: Colors.primary },
  providerBtnSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  // AI step
  apiStepsList: { gap: 0 },
  apiStep: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
  apiStepDisabled: { opacity: 0.4 },
  apiStepNum: {
    width: 28, height: 28, borderRadius: 14, minWidth: 28,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  apiStepNumActive: { borderColor: Colors.primary, backgroundColor: 'rgba(230,57,70,0.1)' },
  apiStepNumDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  apiStepNumText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  apiStepBody: { flex: 1, paddingBottom: Spacing.xs },
  apiStepTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 28 },
  apiStepDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: Spacing.sm },
  openBrowserBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  openBrowserBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  doneStepBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(46,196,182,0.1)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(46,196,182,0.3)',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  doneStepBtnText: { fontSize: 13, fontWeight: '600' },
  keySection: { gap: Spacing.sm, marginTop: Spacing.xs },
  keyInputRow: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
  },
  keyInput: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    color: Colors.textPrimary, fontSize: 15,
  },
  keyInputVerified: { borderColor: Colors.success, backgroundColor: 'rgba(46,196,182,0.05)' },
  eyeBtn: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  verifyBtn: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center',
  },
  verifyBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(46,196,182,0.1)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(46,196,182,0.3)',
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  verifiedText: { color: Colors.success, fontSize: 14, fontWeight: '600' },
  notifSection: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm, marginTop: Spacing.sm,
  },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  notifLabel: { flex: 1, ...Typography.body },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timeLabel: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  timeInput: {
    width: 48, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 6, color: Colors.textPrimary, fontSize: 16,
    textAlign: 'center', fontWeight: '700',
  },
  timeSep: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
});
