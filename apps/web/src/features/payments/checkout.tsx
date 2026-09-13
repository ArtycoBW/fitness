"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { api, post, ApiError } from "@/lib/api";
import { money, dateOnly, visits } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/layout/public-header";
import { ModernPaymentForm } from "@/components/ui/modern-payment-form";
import { AnimatedTicket } from "@/components/ui/ticket-confirmation-card";
import { statuses, type Order, type Payment, type Confirmation } from "./types";
export function Checkout({
  id,
  embedded = false,
  onComplete,
}: {
  id: string;
  embedded?: boolean;
  onComplete?: (id: string) => void;
}) {
  const router = useRouter(),
    [key] = useState(() => crypto.randomUUID());
  const {
    data: o,
    error,
    refetch,
  } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>("/orders/" + id),
    refetchInterval: (q) =>
      q.state.data?.payments.some((p) =>
        ["PROCESSING", "UNKNOWN"].includes(p.status),
      )
        ? 1500
        : false,
  });
  const payment = o?.payments[0];
  const pay = useMutation({
    mutationFn: ({ method, last4 }: { method: string; last4?: string }) =>
      post<Payment>(
        "/orders/" + id + "/payment-attempts",
        { method, ...(last4 ? { maskedLast4: last4 } : {}) },
        key + ":" + (payment?.status === "FAILED" ? payment.id : "first"),
      ),
    onSuccess: () => void refetch(),
  });
  useEffect(() => {
    if (payment?.status === "SUCCEEDED") {
      if (onComplete) onComplete(payment.id);
      else router.replace("/payments/" + payment.id + "/confirmation");
    }
  }, [payment?.status, payment?.id, router, onComplete]);
  const pending =
    pay.isPending ||
    (!!payment &&
      ["PROCESSING", "UNKNOWN", "SUCCEEDED"].includes(payment.status));
  return (
    <>
      {!embedded && <PublicHeader />}
      <main className="checkout-page">
        <Link href="/memberships" className="back-link">
          <ArrowLeft size={15} />К абонементам
        </Link>
        {error ? (
          <div className="surface">
            <h1>Не удалось открыть заказ</h1>
            <p className="form-error">{error.message}</p>
            {error instanceof ApiError && error.status === 401 && (
              <Link
                href={"/login?next=" + encodeURIComponent("/checkout/" + id)}
              >
                Войти в аккаунт
              </Link>
            )}
          </div>
        ) : !o ? (
          <p role="status">Открываем заказ…</p>
        ) : (
          <div className="checkout-grid">
            <section className="order-summary">
              <span className="eyebrow">ВАШ НОВЫЙ РИТМ</span>
              <h1>
                Место для
                <br />
                <em>движения.</em>
              </h1>
              <div className="order-product">
                <span className="eyebrow">АБОНЕМЕНТ</span>
                <h2>{o.productSnapshot.title}</h2>
                <p>{o.productSnapshot.description}</p>
                <ul>
                  <li>
                    <Check size={16} />
                    {o.productSnapshot.visitLimit === null
                      ? "Безлимитные посещения"
                      : visits(o.productSnapshot.visitLimit)}
                  </li>
                  <li>
                    <Check size={16} />
                    {o.productSnapshot.durationDays} дней с{" "}
                    {dateOnly(o.activationDate)}
                  </li>
                  <li>
                    <Check size={16} />
                    {o.productSnapshot.freezeQuotaDays} дней заморозки
                  </li>
                </ul>
                <div className="order-total">
                  <span>Итого</span>
                  <strong>{money(o.totalMinor)}</strong>
                </div>
              </div>
              <p className="muted">
                {o.client.name} · После покупки можно выбрать занятие в
                расписании.
              </p>
            </section>
            <div>
              {pending ? (
                <section className="payment-form payment-pending">
                  <LoaderCircle className="spin" size={34} />
                  <h2>
                    {payment
                      ? statuses[payment.status]
                      : "Подготавливаем оплату"}
                  </h2>
                  <p>
                    Дождитесь подтверждения. Можно вернуться в кабинет —
                    результат покупки сохранится.
                  </p>
                  <Button asChild variant="outline">
                    <Link href="/account/payments">История оплат</Link>
                  </Button>
                </section>
              ) : o.status !== "PENDING" ||
                new Date(o.expiresAt) <= new Date() ? (
                <section className="payment-form">
                  <h2>Заказ закрыт</h2>
                  <p>Выберите актуальный абонемент, чтобы оформить покупку.</p>
                  <Button asChild>
                    <Link href="/memberships">Выбрать абонемент</Link>
                  </Button>
                </section>
              ) : (
                <ModernPaymentForm
                  key={payment?.id ?? "first"}
                  amountMinor={o.totalMinor}
                  pending={pending}
                  error={
                    pay.error?.message ??
                    (payment?.status === "FAILED"
                      ? "Не удалось завершить оплату. Можно попробовать снова."
                      : undefined)
                  }
                  onPay={(method, last4) => {
                    pay.mutate({ method, last4 });
                  }}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
export function ConfirmationPage({
  id,
  embedded = false,
}: {
  id: string;
  embedded?: boolean;
}) {
  const { data, error } = useQuery({
    queryKey: ["confirmation", id],
    queryFn: () => api<Confirmation>("/payments/" + id + "/confirmation"),
  });
  return (
    <>
      {!embedded && <PublicHeader />}
      <main className="confirmation-page">
        {error ? (
          <section className="surface">
            <h1>Подтверждение пока недоступно</h1>
            <p className="form-error">{error.message}</p>
            <Link href="/account/payments">К истории оплат</Link>
          </section>
        ) : data ? (
          <AnimatedTicket confirmation={data} />
        ) : (
          <p role="status">Загружаем подтверждение…</p>
        )}
      </main>
    </>
  );
}
