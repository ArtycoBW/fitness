export const methods: Record<string, string> = {
  CARD: "Банковская карта",
  ALFA_PAY: "Альфа Pay",
  YANDEX_PAY: "Яндекс Pay",
  SBER_PAY: "Сбер Pay",
  CASH: "Наличные",
  TERMINAL: "Терминал",
};
export const statuses: Record<string, string> = {
  PROCESSING: "Обработка оплаты",
  UNKNOWN: "Проверяем статус",
  SUCCEEDED: "Оплачено",
  FAILED: "Не удалось оплатить",
  CANCELLED: "Отменено",
};
export interface Payment {
  id: string;
  orderId: string;
  method: string;
  status: string;
  amountMinor: number;
  maskedLast4: string | null;
  confirmedAt: string | null;
  createdAt: string;
  client?: { name: string };
  title?: string;
  refundedMinor?: number;
  refunds?: Refund[];
  membership?: {
    id: string;
    version: number;
    consumed: number;
    reserved: number;
    available: number;
    refundHold: boolean;
    cancelledAt: string | null;
  };
  confirmation?: Confirmation | null;
}
export interface Refund {
  id: string;
  amountMinor: number;
  status: string;
  reason: string;
  entitlementAction: string;
  createdAt: string;
  completedAt: string | null;
}
export interface Confirmation {
  reference: string;
  issuedAt: string;
  immutableSnapshot: {
    paymentId: string;
    membershipId: string;
    title: string;
    clientName: string;
    amountMinor: number;
    method: string;
    maskedLast4: string | null;
    date: string;
  };
}
export interface Order {
  id: string;
  status: string;
  totalMinor: number;
  activationDate: string;
  expiresAt: string;
  client: { name: string };
  productSnapshot: {
    title: string;
    description: string;
    durationDays: number;
    visitLimit: number | null;
    freezeQuotaDays: number;
  };
  payments: Payment[];
  membership: { id: string } | null;
}
