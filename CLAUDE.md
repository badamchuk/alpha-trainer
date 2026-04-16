# AlphaTrainer

## Що це
Мобільний фітнес-додаток для iOS/Android. Логування тренувань, харчування,
відстеження прогресу, AI-тренер і AI-нутріціолог. Без бекенду — все локально.

## Технології
- Expo SDK 55 / React Native 0.83 / TypeScript
- expo-router (файлова маршрутизація, tabs layout)
- @google/generative-ai (Gemini) + Groq API (llama-3.3-70b) — обидва підтримуються, Groq пріоритетніший
- AsyncStorage — локальне сховище
- @expo/vector-icons (Ionicons)

## Структура
- `app/(tabs)/` — екрани: index (головна), nutrition, progress, goals, journal, trainer
- `app/workout/` — log.tsx (логування), [id].tsx (деталі запису)
- `app/onboarding/` — онбординг з профілем користувача
- `services/` — вся бізнес-логіка:
  - `storage.ts` — AsyncStorage: профіль, тренування, цілі, вага, чат
  - `nutrition.ts` — харчування: прийоми їжі, цілі КБЖВ, бібліотека страв
  - `gemini.ts` — Gemini API: чат тренера, нутріціолог, парсинг їжі, денна порада
  - `groq.ts` — Groq API: ті ж функції що в gemini.ts (взаємозамінні)
  - `aiMemory.ts` — довготривала пам'ять AI між сесіями
  - `backup.ts` — експорт/імпорт JSON резервної копії
  - `wellbeing.ts` — самопочуття (сон, настрій)
  - `water.ts` — трекер води
  - `i18n.ts` — локалізація (укр/eng)
- `types/index.ts` — всі TypeScript інтерфейси
- `constants/theme.ts` — кольори, відступи, типографіка

## Правила
- Мова UI — українська
- AI відповідає українською (прописано в системних промптах)
- Дати — завжди через `getLocalDateString(date)` з storage.ts, ніколи не UTC математика
- KeyboardAvoidingView обов'язковий у всіх модалах з TextInput:
  `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`
- Всі нові AsyncStorage ключі додавати в `services/backup.ts` ALL_KEYS
- Запуск: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" && npx expo run:android`
- Підключений пристрій: Pixel 8 Pro (ADB ID: 37171FDJG00AGK)

## Поточний стан
- Всі основні екрани реалізовані та працюють
- AI тренер: chat + streaming + пам'ять + генерація плану тренувань
- AI нутріціолог: окремий чат, бачить 7-денну історію харчування + тренування
- Тренер бачить харчування за останні 3 дні
- Харчування: навігація по датах (← →), КБЖВ + клітковина, редагування, бібліотека страв
- Профіль: стать враховується у формулі Mifflin-St Jeor (BMR)
- Резервне копіювання (експорт/імпорт JSON)
