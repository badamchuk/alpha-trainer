/**
 * foodAI.ts — barcode lookup (Open Food Facts) + photo nutrition analysis (Gemini Vision)
 */

import { ParsedFoodItem } from './nutrition';

// ─── Open Food Facts ──────────────────────────────────────────────────────────

export interface OFFProduct {
  name: string;
  brand?: string;
  quantity?: string;
  calories: number;    // per 100g
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize?: number; // grams
}

export async function lookupBarcode(barcode: string): Promise<OFFProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,quantity,serving_size,nutriments`,
      { headers: { 'User-Agent': 'AlphaTrainer/1.0 (contact@alphatrainer.app)' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return parseOFFProduct(json.product);
  } catch {
    return null;
  }
}

/** Search Open Food Facts by product name. Returns top matches. */
export async function searchFoodByName(query: string): Promise<OFFProduct[]> {
  try {
    const encoded = encodeURIComponent(query.trim());
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,brands,quantity,serving_size,nutriments`,
      { headers: { 'User-Agent': 'AlphaTrainer/1.0 (contact@alphatrainer.app)' } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json.products)) return [];
    return json.products
      .map(parseOFFProduct)
      .filter((p: OFFProduct | null): p is OFFProduct => p !== null && p.calories > 0);
  } catch {
    return [];
  }
}

function parseOFFProduct(p: any): OFFProduct | null {
  if (!p) return null;
  const n = p.nutriments ?? {};
  const calories = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0);
  const protein  = n['proteins_100g'] ?? n['protein_100g'] ?? 0;
  const carbs    = n['carbohydrates_100g'] ?? n['carbs_100g'] ?? 0;
  const fat      = n['fat_100g'] ?? 0;
  const fiber    = n['fiber_100g'] ?? n['fibers_100g'] ?? undefined;
  if (!calories && !protein && !carbs && !fat) return null;
  return {
    name: p.product_name || 'Невідомий продукт',
    brand: p.brands || undefined,
    quantity: p.quantity || undefined,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs:   Math.round(carbs * 10) / 10,
    fat:     Math.round(fat * 10) / 10,
    fiber:   fiber !== undefined ? Math.round(fiber * 10) / 10 : undefined,
    servingSize: p.serving_size ? parseServingGrams(p.serving_size) : undefined,
  };
}

function parseServingGrams(raw: string): number | undefined {
  const match = raw.match(/(\d+[\.,]?\d*)\s*g/i);
  if (match) return parseFloat(match[1].replace(',', '.'));
  return undefined;
}

export function offProductToFoodItem(product: OFFProduct, grams: number): ParsedFoodItem {
  const f = grams / 100;
  return {
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    qty: `${grams}г`,
    calories: Math.round(product.calories * f),
    protein:  Math.round(product.protein * f * 10) / 10,
    carbs:    Math.round(product.carbs * f * 10) / 10,
    fat:      Math.round(product.fat * f * 10) / 10,
    fiber:    product.fiber !== undefined ? Math.round(product.fiber * f * 10) / 10 : undefined,
  };
}

// ─── Vision — photo nutrition analysis ────────────────────────────────────────

const GEMINI_VISION_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

// Llama 4 — мультимодальні моделі Groq з підтримкою vision
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
];

const PHOTO_PROMPT = `Ти — AI-нутріціолог. Уважно проаналізуй це фото їжі.

ВАЖЛИВО: Навіть якщо фото нечітке або часткове — постарайся визначити страву і дай свою найкращу оцінку.
Краще дати приблизні дані, ніж відмовитися.

Поверни JSON у такому форматі (тільки JSON, без пояснень, без markdown):
{
  "mealName": "Назва страви",
  "items": [
    {
      "name": "назва продукту або інгредієнта",
      "qty": "приблизна кількість (напр. '200г', '1 тарілка', '2 шт')",
      "calories": 300,
      "protein": 12,
      "carbs": 45,
      "fat": 8,
      "fiber": 3
    }
  ],
  "totalCalories": 300,
  "totalProtein": 12,
  "totalCarbs": 45,
  "totalFat": 8
}

Якщо зображення абсолютно нерозпізнавано (не їжа, порожнє фото) — поверни:
{ "error": "not_food" }

Орієнтуйся на типові порції. fiber=0 якщо невідомо.`;

export interface PhotoNutritionResult {
  mealName: string;
  items: ParsedFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

/** Thrown when all models fail. message contains the last API error. */
export class PhotoAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoAnalysisError';
  }
}

function parsePhotoJson(text: string): PhotoNutritionResult | null | 'continue' {
  const clean = text.trim()
    .replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  let parsed: any;
  try { parsed = JSON.parse(clean); } catch {
    const m = clean.match(/\{[\s\S]+\}/);
    if (!m) return 'continue';
    try { parsed = JSON.parse(m[0]); } catch { return 'continue'; }
  }
  if (parsed.error) return null; // not_food
  if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) return 'continue';
  return {
    mealName: parsed.mealName || 'Страва з фото',
    items: parsed.items.map((it: any) => ({
      name: String(it.name || ''),
      qty: String(it.qty || '1 порція'),
      calories: Number(it.calories) || 0,
      protein: Number(it.protein) || 0,
      carbs: Number(it.carbs) || 0,
      fat: Number(it.fat) || 0,
      fiber: it.fiber != null ? Number(it.fiber) : undefined,
    })),
    totalCalories: Number(parsed.totalCalories) || 0,
    totalProtein: Number(parsed.totalProtein) || 0,
    totalCarbs: Number(parsed.totalCarbs) || 0,
    totalFat: Number(parsed.totalFat) || 0,
  };
}

export async function analyzePhotoNutrition(
  base64Image: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  geminiApiKey?: string,
  groqApiKey?: string,
): Promise<PhotoNutritionResult | null> {
  const hasGemini = !!geminiApiKey;
  const hasGroq   = !!groqApiKey;
  if (!hasGemini && !hasGroq) {
    throw new PhotoAnalysisError('Додай Gemini або Groq API ключ у профілі → AI-моделі.');
  }

  const imageSizeKB = Math.round(base64Image.length * 0.75 / 1024);
  if (imageSizeKB > 3072) {
    throw new PhotoAnalysisError(
      `Фото занадто велике (${imageSizeKB} КБ). Сфотографуй їжу ближче або вибери менший знімок.`
    );
  }

  let geminiOk = false;
  let groqOk   = false;

  // ── Gemini ───────────────────────────────────────────────────────────────────
  if (hasGemini) {
    const reqBody = {
      contents: [{ parts: [
        { text: PHOTO_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Image } },
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    };
    for (const model of GEMINI_VISION_MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) }
        );
        const json = await res.json();
        if (!res.ok) {
          const errMsg: string = json?.error?.message ?? '';
          const status: string = json?.error?.status ?? '';
          if (res.status === 400 && errMsg.toLowerCase().includes('api key')) {
            throw new PhotoAnalysisError('Невірний Gemini API ключ. Перевір ключ у профілі → AI-моделі.');
          }
          if (res.status === 403 || status === 'PERMISSION_DENIED') {
            throw new PhotoAnalysisError('Gemini API ключ не має доступу. Перевір ключ у профілі → AI-моделі.');
          }
          if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
            geminiOk = false; break; // усі моделі Gemini теж отримають 429
          }
          geminiOk = false; continue;
        }
        const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) continue;
        const result = parsePhotoJson(text);
        if (result !== 'continue') return result;
      } catch (e: any) {
        if (e instanceof PhotoAnalysisError) throw e;
        geminiOk = false;
      }
    }
  }

  // ── Groq Llama 4 Vision ───────────────────────────────────────────────────────
  if (hasGroq) {
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    for (const model of GROQ_VISION_MODELS) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: PHOTO_PROMPT },
            ]}],
            max_tokens: 1024,
            temperature: 0.1,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401) throw new PhotoAnalysisError('Невірний Groq API ключ. Перевір ключ у профілі → AI-моделі.');
          if (res.status === 429) { groqOk = false; break; }
          groqOk = false; continue;
        }
        const text: string = json?.choices?.[0]?.message?.content ?? '';
        if (!text) continue;
        const result = parsePhotoJson(text);
        if (result !== 'continue') return result;
      } catch (e: any) {
        if (e instanceof PhotoAnalysisError) throw e;
        groqOk = false;
      }
    }
  }

  // ── Підбір помилки залежно від того що підключено ────────────────────────────
  if (hasGemini && !hasGroq) {
    throw new PhotoAnalysisError(
      'Gemini не зміг обробити фото (ліміт або помилка).\n\nДодай Groq API ключ у профілі → AI-моделі як резервний варіант.'
    );
  }
  if (!hasGemini && hasGroq) {
    throw new PhotoAnalysisError(
      'Groq не зміг обробити фото (ліміт або помилка).\n\nДодай Gemini API ключ у профілі → AI-моделі як резервний варіант.'
    );
  }
  throw new PhotoAnalysisError(
    'Ні Gemini, ні Groq не змогли обробити фото.\n\nПеревір ліміти API або спробуй пізніше.'
  );
}
