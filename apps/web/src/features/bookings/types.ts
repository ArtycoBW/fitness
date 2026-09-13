export const bookingStatuses: Record<string, string> = {
  CONFIRMED: "Запись подтверждена",
  WAITLISTED: "В очереди",
  WAITLIST_EXPIRED: "Очередь завершена",
  WAITLIST_SKIPPED: "Место не подтверждено",
  CANCELLED_ON_TIME: "Отменено вовремя",
  CANCELLED_LATE: "Поздняя отмена",
  CANCELLED_BY_CLUB: "Отменено клубом",
  ATTENDED: "Посещение",
  NO_SHOW: "Неявка",
};
export interface Booking {
  id: string;
  clientId: string;
  sessionId: string;
  membershipId: string;
  status: string;
  balanceState: string;
  version: number;
  reason: string | null;
  client: { id: string; name: string };
  session: {
    id: string;
    trainerId: string;
    startAt: string;
    endAt: string;
    workout: { name: string; category: string };
    trainer: { user: { name: string } };
    hall: { name: string };
    policySnapshot: { cancelMinutes: number };
  };
  membership: {
    id: string;
    termsSnapshot: { title: string; visitLimit: number | null };
  };
  events?: {
    id: string;
    toStatus: string;
    createdAt: string;
    reason: string | null;
  }[];
}
