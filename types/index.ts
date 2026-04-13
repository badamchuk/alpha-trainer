export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
  availableDays: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  equipment: string[];
  geminiApiKey: string;
  groqApiKey?: string;
  onboardingComplete: boolean;
}

export interface Goal {
  id: string;
  title: string;
  type: 'strength' | 'endurance' | 'weight_loss' | 'muscle_gain' | 'flexibility' | 'custom';
  target: string;
  currentValue?: string;
  deadline?: string;
  createdAt: string;
  completed: boolean;
}

export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';

export interface ExerciseLog {
  name: string;
  sets?: number;
  reps?: number;
  weight?: number;
  duration?: number; // minutes
  distance?: number; // km
  calories?: number; // kcal
  watts?: number;    // average power (rowing, cycling)
  notes?: string;
  supersetId?: string; // exercises sharing the same supersetId form a superset
  rpe?: number;        // Rate of Perceived Exertion 1–10
  setType?: SetType;   // normal | warmup | dropset | failure
}

export interface WorkoutEntry {
  id: string;
  date: string; // YYYY-MM-DD
  workoutType: string;
  exercises: ExerciseLog[];
  notes: string;
  duration: number; // minutes
  completedAt: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  aiGeneratedPlan?: string;
  // Cardio / run-specific fields (workout-level)
  totalDistance?: number;    // km
  avgPace?: number;          // seconds per km (auto-computed or manual)
  avgHeartRate?: number;     // bpm
  maxHeartRate?: number;     // bpm
  elevationGain?: number;    // meters
  totalCalories?: number;    // kcal (workout total)
}

export interface TrainingPlan {
  id: string;
  createdAt: string;
  weeklySchedule: DayPlan[];
  goals: string[];
  generatedFor: string; // user description
}

export interface DayPlan {
  dayOfWeek: number; // 0-6
  workoutType: string;
  description: string;
  exercises: PlannedExercise[];
  estimatedDuration: number;
}

export interface PlannedExercise {
  name: string;
  sets?: number;
  reps?: string; // "8-12" or "AMRAP"
  weight?: string; // "60% of 1RM" or "bodyweight"
  duration?: string; // "30 min"
  restTime?: string; // "90 sec"
  notes?: string;
}

export interface BodyMeasurement {
  date: string;       // YYYY-MM-DD
  waist?: number;     // cm
  chest?: number;     // cm
  hips?: number;      // cm
  bicep?: number;     // cm
  thigh?: number;     // cm
  neck?: number;      // cm
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export type WorkoutType =
  | 'strength'
  | 'cardio'
  | 'crossfit'
  | 'hiit'
  | 'yoga'
  | 'recovery'
  | 'run'
  | 'cycling'
  | 'swimming'
  | 'custom';
