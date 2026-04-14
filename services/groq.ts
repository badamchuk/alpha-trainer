import { UserProfile, Goal, WorkoutEntry } from '../types';

let groqApiKey: string | null = null;

export function initGroq(apiKey: string): void {
  groqApiKey = apiKey;
}

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
let activeModel = MODELS[0];

async function callGroq(
  messages: { role: string; content: string }[],
  model = activeModel
): Promise<string> {
  if (!groqApiKey) throw new Error('Groq не ініціалізовано. Додай API ключ у налаштуваннях.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || response.statusText;
    const e = new Error(msg) as any;
    if (response.status === 401) e.type = 'invalid_key';
    if (response.status === 429) e.type = 'quota';
    throw e;
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callWithFallback(
  messages: { role: string; content: string }[]
): Promise<string> {
  for (let i = MODELS.indexOf(activeModel); i < MODELS.length; i++) {
    try {
      const result = await callGroq(messages, MODELS[i]);
      activeModel = MODELS[i];
      return result;
    } catch (e: any) {
      if (e.type === 'quota' && i < MODELS.length - 1) {
        console.warn(`[Groq] ${MODELS[i]} quota exceeded, trying ${MODELS[i + 1]}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Всі Groq моделі недоступні');
}

function buildSystemContext(
  profile: UserProfile,
  goals: Goal[],
  recentWorkouts: WorkoutEntry[],
  memoryBlock = ''
): string {
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
      const cardioStats: string[] = [];
      if (w.totalDistance) cardioStats.push(`${w.totalDistance}км`);
      if (w.totalCalories) cardioStats.push(`${w.totalCalories}ккал`);
      if (w.avgHeartRate) cardioStats.push(`ЧСС: ${w.avgHeartRate}/${w.maxHeartRate ?? '?'}`);
      if (cardioStats.length > 0) lines.push(`  ↳ ${cardioStats.join(', ')}`);
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
  const level =
    profile.fitnessLevel === 'beginner'
      ? 'початківець'
      : profile.fitnessLevel === 'intermediate'
      ? 'середній'
      : 'просунутий';

  return `Ти персональний AI-тренер в додатку AlphaTrainer. Відповідай українською мовою.

ПРОФІЛЬ СПОРТСМЕНА:
- Ім'я: ${profile.name}
- Вік: ${profile.age} років
- Вага: ${profile.weight} кг, Зріст: ${profile.height} см
- Рівень підготовки: ${level}
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
  history: { role: 'user' | 'assistant'; content: string }[],
  memoryBlock = ''
): Promise<string> {
  const systemContext = buildSystemContext(profile, goals, recentWorkouts, memoryBlock);
  const messages = [
    { role: 'system', content: systemContext },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];
  return callWithFallback(messages);
}

export async function chatStream(
  message: string,
  profile: UserProfile,
  goals: Goal[],
  recentWorkouts: WorkoutEntry[],
  history: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (text: string) => void,
  memoryBlock = ''
): Promise<string> {
  // React Native's fetch does not support ReadableStream (response.body),
  // so we use the regular non-streaming endpoint and call onChunk once done.
  const reply = await chat(message, profile, goals, recentWorkouts, history, memoryBlock);
  onChunk(reply);
  return reply;
}

export async function extractMemoryNote(
  userMessage: string,
  aiReply: string
): Promise<string> {
  if (!groqApiKey) return '';
  try {
    const result = await callGroq(
      [{
        role: 'user',
        content: `Витягни 1-2 ключових факти про спортсмена з цього фрагменту розмови. Лише конкретні факти: травми, досягнення, переваги, проблеми зі здоров'ям, скарги, нові цілі. Якщо нічого важливого — відповідай "—". Без вступу, максимум 50 слів.

Питання: ${userMessage.slice(0, 300)}
Відповідь AI: ${aiReply.slice(0, 500)}`,
      }],
      'llama-3.1-8b-instant'
    );
    return result.trim();
  } catch {
    return '';
  }
}

export async function generateTrainingPlan(
  profile: UserProfile,
  goals: Goal[]
): Promise<string> {
  const goalsList = goals
    .filter((g) => !g.completed)
    .map((g) => `${g.title}: ${g.target}`)
    .join('; ');
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const availDays = profile.availableDays.map((d) => days[d]).join(', ');
  const equipment = profile.equipment.length > 0 ? profile.equipment.join(', ') : 'немає';
  const level =
    profile.fitnessLevel === 'beginner'
      ? 'початківець'
      : profile.fitnessLevel === 'intermediate'
      ? 'середній'
      : 'просунутий';

  const prompt = `Створи тижневий план тренувань для:
- Рівень: ${level}
- Вага: ${profile.weight} кг, Зріст: ${profile.height} см
- Обладнання: ${equipment}
- Доступні дні: ${availDays}
- Цілі: ${goalsList || 'загальна фізична підготовка'}

Формат відповіді: план по кожному дню тижня (Понеділок, Вівторок, і т.д.) з конкретними вправами, підходами, повторами та відпочинком. Включи дні відновлення. Відповідай українською.`;

  return callWithFallback([{ role: 'user', content: prompt }]);
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

  const raw = await callWithFallback([{ role: 'user', content: prompt }]);
  const json = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(json) as NutritionParseResult;
}

export async function getDailyAdvice(
  profile: UserProfile,
  goals: Goal[],
  recentWorkouts: WorkoutEntry[]
): Promise<string> {
  const lastWorkout = recentWorkouts[0];
  const context = lastWorkout
    ? `Останнє тренування: ${lastWorkout.date} — ${lastWorkout.workoutType} (${lastWorkout.duration} хв)`
    : 'Тренувань ще не було';

  const systemContext = buildSystemContext(profile, goals, recentWorkouts);
  const prompt = `${systemContext}

Дай коротку мотивуючу пораду на сьогодні (2-3 речення). ${context}.
Враховуй відновлення. Будь конкретним і мотивуючим.`;

  return callWithFallback([{ role: 'user', content: prompt }]);
}

export async function verifyGroqApiKey(
  apiKey: string
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const trimmedKey = apiKey.trim();
  for (const model of MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) return { ok: true, model };

      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || response.statusText;

      if (response.status === 401)
        return { ok: false, error: 'Невірний API ключ. Перевір ключ на console.groq.com' };
      if (response.status === 429) {
        if (model !== MODELS[MODELS.length - 1]) continue;
        return { ok: true, model, error: 'quota_warning' };
      }
      if (model !== MODELS[MODELS.length - 1]) continue;
      return { ok: false, error: `Помилка: ${msg.slice(0, 200)}` };
    } catch (e: any) {
      if (e.message?.includes('Network') || e.message?.includes('fetch'))
        return { ok: false, error: 'Немає інтернету або сервіс недоступний' };
      if (model !== MODELS[MODELS.length - 1]) continue;
      return { ok: false, error: `Помилка: ${e.message?.slice(0, 200)}` };
    }
  }
  return { ok: false, error: 'Не вдалося перевірити ключ' };
}

export function getActiveGroqModel(): string {
  return activeModel;
}
