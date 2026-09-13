export interface Session {
  id: string;
  seriesId: string | null;
  workoutId: string;
  trainerId: string;
  hallId: string;
  startAt: string;
  endAt: string;
  capacity: number;
  freePlaces: number;
  status: string;
  version: number;
  cancelledReason: string | null;
  policySnapshot: {
    cancelMinutes: number;
    bookingOpenDays: number;
    bookingCloseMinutes: number;
  };
  workout: {
    name: string;
    category: string;
    level: string;
    description: string;
    durationMinutes: number;
    imageUrl: string | null;
  };
  trainer: { id: string; user: { name: string; avatarUrl: string | null } };
  hall: { id: string; name: string; capacity: number };
}
export const statusNames: Record<string, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Запись открыта",
  IN_PROGRESS: "Идёт занятие",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
};
export const localDay = (value = new Date()) =>
  new Date(value.getTime() + 10800000).toISOString().slice(0, 10);
export const addDays = (value: string, days: number) =>
  new Date(new Date(value + "T12:00:00Z").getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const monday = (value: string) => {
  const day = new Date(value + "T12:00:00Z").getUTCDay();
  return addDays(value, -((day + 6) % 7));
};
export const localInput = (value: string) =>
  new Date(new Date(value).getTime() + 10800000).toISOString().slice(0, 16);
export const minutes = (value: string) => {
  const d = new Date(new Date(value).getTime() + 10800000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const time = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
