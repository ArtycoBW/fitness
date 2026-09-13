export type Area = "admin" | "trainer" | "account";
export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string[];
  instructions: string;
  metricType: "REPS" | "DURATION";
  version: number;
  archivedAt: string | null;
}
export interface Prescription {
  exerciseId: string;
  sets: number;
  reps: number | null;
  durationSeconds: number | null;
  weightKg: number | null;
  restSeconds: number;
  notes: string;
}
export interface DraftDay {
  weekNumber: number;
  dayIndex: number;
  title: string;
  exercises: Prescription[];
}
export interface Draft {
  title: string;
  goal: string;
  level: string;
  weeks: number;
  days: DraftDay[];
}
export interface PublishedExercise extends Prescription {
  id: string;
  exerciseSnapshot: Exercise;
}
export interface PublishedDay extends Omit<DraftDay, "exercises"> {
  id: string;
  exercises: PublishedExercise[];
}
export interface Published extends Omit<Draft, "days"> {
  id: string;
  number: number;
  days: PublishedDay[];
  publishedAt: string;
  _count?: { days: number };
}
export interface Program {
  id: string;
  title: string;
  draft: Draft;
  version: number;
  archivedAt: string | null;
  author: { id: string; user: { name: string } };
  versions: Published[];
}
export interface ActualSet {
  programExerciseId: string;
  setIndex: number;
  actualReps: number | null;
  actualSeconds: number | null;
  actualWeightKg: number | null;
}
export interface DayLog {
  id: string;
  dayId: string;
  version: number;
  performedOn: string;
  completedAt: string | null;
  comment: string;
  sets: ActualSet[];
  revisions: {
    version: number;
    createdAt: string;
    snapshot: { comment: string; completed: boolean; sets: ActualSet[] };
  }[];
}
export interface Assignment {
  id: string;
  programId: string;
  version: number;
  status: string;
  startsOn: string;
  replacedById: string | null;
  client: { name: string };
  trainer: { user: { name: string } };
  programVersion: Published;
  logs: DayLog[];
  _count?: { logs: number };
  comments: {
    id: string;
    authorName: string;
    body: string;
    visibility: string;
    createdAt: string;
  }[];
}
export const states: Record<string, string> = {
  ACTIVE: "В процессе",
  COMPLETED: "Завершена",
  REPLACED: "Заменена",
  CANCELLED: "Прекращена",
};
export const levels: Record<string, string> = {
  ALL: "Любой уровень",
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
};
export const today = () =>
  new Date(Date.now() + 10800000).toISOString().slice(0, 10);
