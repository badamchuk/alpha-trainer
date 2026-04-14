import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserProfile, Goal, WorkoutEntry } from '../types';

let genAI: GoogleGenerativeAI | null = null;

export function initGemini(apiKey: string): void {
  genAI = new GoogleGenerativeAI(apiKey);
}

function getModel() {
  if (!genAI) throw new Error('Gemini не ініціалізовано. Додай API ключ у налаштуваннях.');
  return genAI.getGenerativeModel({ model: activeModel });
}

async function callWithFallback<T>(fn: (model: ReturnType<typeof getModel>) => Promise<T>): Promise<T> {
  if (!genAI) throw new Error('Gemini не ініціалізовано. Додай API ключ у налаштуваннях.');
  for (let i = MODELS.indexOf(activeModel); i < MODELS.length; i++) {
    try {
      const model = genAI.getGenerativeModel({ model: MODELS[i] });
      const result = await fn(model);
      activeModel = MODELS[i]; // remember working model
      return result;
    } catch (e: any) {
      const parsed = parseGeminiError(e);
      if ((parsed.type === 'quota' || parsed.type === 'not_found') && i < MODELS.length - 1) {
        console.warn(`[Gemini] ${MODELS[i]} unavailable (${parsed.type}), trying ${MODELS[i + 1]}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Всі моделі Gemini недоступні');
}

function buildSystemContext(profile: UserProfile, goals: Goal[], recentWorkouts: WorkoutEntry[], memoryBlock = ''): string {
  const goalsList = goals
    .filter((g) => !g.completed)
    .map((g) => `- ${g.title}: ${g.target}`)
    .join('\n');

  const workoutHistory = recentWorkouts
    .slice(0, 5)
    .map((w) => {
      const rating = w.rating ? ` ⭐${w.rating}` : '';
      const header = `${w.date} — ${w.workoutType} (${w.duration} хв)${rating}`;
      const lines: string[] = [];
      // Cardio workout-level stats
      const cardioStats: string[] = [];
      if (w.totalDistance) cardioStats.push(`${w.totalDistance}км`);
      if (w.totalCalories) cardioStats.push(`${w.totalCalories}ккал`);
      if (w.avgHeartRate) cardioStats.push(`ЧСС: ${w.avgHeartRate}/${w.maxHeartRate ?? '?'}`);
      if (cardioStats.length > 0) lines.push(`  ↳ ${cardioStats.join(', ')}`);
      // Exercises
      for (const e of w.exercises) {
        if (e.sets && e.reps && e.weight) lines.push(`  • ${e.name}: ${e.sets}×${e.reps} @ ${e.weight}кг`);
        else if (e.sets && e.reps) lines.push(`  • ${e.name}: ${e.sets}×${e.reps}`);
        else if (e.distance) lines.push(`  • ${e.name}: ${e.distance}км`);
        else if (e.duration) lines.push(`  • ${e.name}: ${e.duration}хв`);
        else lines.push(`  • ${e.name}`);
      }
      if (w.notes) lines.push(`  Нотатки: ${w.notes}`);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');

  const equipment = profile.equipment.length > 0 ? profile.equipment.join(', ') : 'немає';
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const availDays = profile.availableDays.map((d) => days[d]).join(', ');

  return `Ти персональний AI-тренер в додатку AlphaTrainer. Відповідай українською мовою.

ПРОФІЛЬ СПОРТСМЕНА:
- Ім'я: ${profile.name}
- Вік: ${profile.age} років
- Вага: ${profile.weight} кг, Зріст: ${profile.height} см
- Рівень підготовки: ${profile.fitnessLevel === 'beginner' ? 'початківець' : profile.fitnessLevel === 'intermediate' ? 'середній' : 'просунутий'}
- Доступне обладнання: ${equipment}
- Тренувальні дні: ${availDays}

АКТИВНІ ЦІЛІ:
${goalsList || 'Цілі не встановлено'}

ОСТАННІ 5 ТРЕНУВАНЬ (детально):
${workoutHistory || 'Тренувань ще немає'}

Давай конкретні, персоналізовані поради на основі реальних даних тренувань:
- Аналізуй прогресію ваг і об'єму (чи збільшується навантаження?)
- Звертай увагу на паузи між тренуваннями (перетренованість / недостатнє навантаження)
- Пропонуй конкретні ваги/повтори на наступне тренування
- Якщо спортсмен повторює одні й ті ж вправи — давай варіації
Будь мотивуючим але реалістичним.${memoryBlock}`;
}

export async function chat(
  message: string,
  profile: UserProfile,
  goals: Goal[],
  recentWorkouts: WorkoutEntry[],
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  memoryBlock = ''
): Promise<string> {
  const systemContext = buildSystemContext(profile, goals, recentWorkouts, memoryBlock);
  return callWithFallback(async (model) => {
    const chatSession = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemContext }] },
        { role: 'model', parts: [{ text: 'Зрозумів! Я готовий допомагати тобі з тренуваннями, враховуючи твій профіль та цілі.' }] },
        ...history,
      ],
    });
    const result = await chatSession.sendMessage(message);
    return result.response.text();
  });
}

export async function chatStream(
  message: string,
  profile: UserProfile,
  goals: Goal[],
  recentWorkouts: WorkoutEntry[],
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  onChunk: (text: string) => void,
  memoryBlock = ''
): Promise<string> {
  const systemContext = buildSystemContext(profile, goals, recentWorkouts, memoryBlock);
  return callWithFallback(async (model) => {
    const chatSession = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemContext }] },
        { role: 'model', parts: [{ text: 'Зрозумів! Я готовий допомагати тобі з тренуваннями, враховуючи твій профіль та цілі.' }] },
        ...history,
      ],
    });
    const result = await chatSession.sendMessageStream(message);
    let fullText = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      onChunk(fullText);
    }
    return fullText;
  });
}

export async function extractMemoryNote(
  userMessage: string,
  aiReply: string
): Promise<string> {
  if (!genAI) return '';
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    const result = await model.generateContent(
      `Витягни 1-2 ключових факти про спортсмена з цього фрагменту розмови. Лише конкретні факти: травми, досягнення, переваги, проблеми зі здоров'ям, скарги, нові цілі. Якщо нічого важливого — відповідай "—". Без вступу, максимум 50 слів.

Питання: ${userMessage.slice(0, 300)}
Відповідь AI: ${aiReply.slice(0, 500)}`
    );
    return result.response.text().trim();
  } catch {
    return '';
  }
}

export async function generateTrainingPlan(
  profile: UserProfile,
  goals: Goal[]
): Promise<string> {
  const goalsList = goals.filter((g) => !g.completed).map((g) => `${g.title}: ${g.target}`).join('; ');
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const availDays = profile.availableDays.map((d) => days[d]).join(', ');
  const equipment = profile.equipment.length > 0 ? profile.equipment.join(', ') : 'немає';
  const level = profile.fitnessLevel === 'beginner' ? 'початківець' : profile.fitnessLevel === 'intermediate' ? 'середній' : 'просунутий';

  const prompt = `Створи тижневий план тренувань для:
- Рівень: ${level}
- Вага: ${profile.weight} кг, Зріст: ${profile.height} см
- Обладнання: ${equipment}
- Доступні дні: ${availDays}
- Цілі: ${goalsList || 'загальна фізична підготовка'}

Формат відповіді: план по кожному дню тижня (Понеділок, Вівторок, і т.д.) з конкретними вправами, підходами, повторами та відпочинком. Включи дні відновлення. Відповідай українською.`;

  return callWithFallback(async (model) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

// Models to try in order (fallback chain)
const MODELS = [
  'gemini-2.5-pro-exp-03-25', // experimental, окремий безкоштовний ліміт
  'gemini-2.0-flash-exp',     // experimental fallback
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',      // маленька модель, свій окремий ліміт
];

function parseGeminiError(e: any): { type: 'invalid_key' | 'quota' | 'not_found' | 'network' | 'unknown'; message: string } {
  const msg: string = e?.message || String(e);
  const status: number = e?.status || 0;

  // Check quota/rate limit FIRST (message contains "fetch" too, so order matters)
  if (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate') || msg.includes('limit')) {
    return { type: 'quota', message: msg };
  }
  if (status === 404 || msg.includes('404') || msg.includes('is not found') || msg.includes('not supported for generateContent')) {
    return { type: 'not_found', message: msg };
  }
  if (status === 400 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('invalid API key')) {
    return { type: 'invalid_key', message: msg };
  }
  if (msg.includes('Network request failed') || msg.includes('network error') || msg.includes('Failed to connect') || msg.includes('ENOTFOUND')) {
    return { type: 'network', message: msg };
  }
  return { type: 'unknown', message: msg };
}

export async function verifyApiKey(apiKey: string): Promise<{ ok: boolean; model?: string; error?: string; rawError?: string }> {
  const trimmedKey = apiKey.trim();

  for (const modelName of MODELS) {
    try {
      const testAI = new GoogleGenerativeAI(trimmedKey);
      const model = testAI.getGenerativeModel({ model: modelName });
      await model.generateContent('Hi');
      return { ok: true, model: modelName };
    } catch (e: any) {
      const parsed = parseGeminiError(e);

      if (parsed.type === 'invalid_key') {
        return { ok: false, error: 'Невірний API ключ. Перевір чи правильно скопійований на aistudio.google.com', rawError: parsed.message };
      }
      if (parsed.type === 'network') {
        return { ok: false, error: 'Немає інтернету або сервіс недоступний. Перевір підключення.', rawError: parsed.message };
      }
      if (parsed.type === 'quota' || parsed.type === 'not_found') {
        // Quota or model unavailable — try next model in fallback chain
        if (modelName !== MODELS[MODELS.length - 1]) {
          continue; // try next model
        }
        // All models quota exceeded — but key is valid!
        return { ok: true, model: modelName, error: 'quota_warning' };
      }
      // Unknown error on this model — try next
      if (modelName !== MODELS[MODELS.length - 1]) {
        continue;
      }
      return { ok: false, error: `Невідома помилка: ${parsed.message.slice(0, 200)}`, rawError: parsed.message };
    }
  }

  return { ok: false, error: 'Не вдалося перевірити ключ' };
}

let activeModel = MODELS[0];

export function getActiveModel(): string {
  return activeModel;
}

export interface NutritionParseResult {
  meals: { name: string; qty: string; calories: number; protein: number; carbs: number; fat: number }[];
  total: { calories: number; protein: number; carbs: number; fat: number };
}

export async function parseNutritionText(text: string): Promise<NutritionParseResult> {
  const prompt = `Ти нутриціолог. Розрахуй КБЖУ для описаної їжі.
Використовуй стандартні порції де не вказана вага. Відповідь ТІЛЬКИ у форматі JSON без жодних пояснень:
{
  "meals": [
    { "name": "Назва продукту", "qty": "кількість", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
  ],
  "total": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
}

Їжа: ${text}`;

  const raw = await callWithFallback(async (model) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  });

  const json = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(json) as NutritionParseResult;
}

export async function getDailyAdvice(
  profile: UserProfile,
  goals: Goal[],
  recentWorkouts: WorkoutEntry[],
  todayPlan?: string
): Promise<string> {
  const lastWorkout = recentWorkouts[0];
  const context = lastWorkout
    ? `Останнє тренування: ${lastWorkout.date} — ${lastWorkout.workoutType} (${lastWorkout.duration} хв)`
    : 'Тренувань ще не було';

  const prompt = `${buildSystemContext(profile, goals, recentWorkouts)}

Дай коротку мотивуючу пораду на сьогодні (2-3 речення). ${todayPlan ? `План на сьогодні: ${todayPlan}` : ''} ${context}.
Враховуй відновлення. Будь конкретним і мотивуючим.`;

  return callWithFallback(async (model) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}
