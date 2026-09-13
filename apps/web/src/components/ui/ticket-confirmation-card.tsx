"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Check, Printer, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Button } from "./button";
import { PayMark } from "./modern-payment-form";
import { money, dateTime } from "@/lib/format";
import { methods, type Confirmation } from "@/features/payments/types";
export function AnimatedTicket({
  confirmation,
}: {
  confirmation: Confirmation;
}) {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });
  const staff = user?.roles.some((r) =>
    ["OWNER", "ADMIN", "RECEPTION"].includes(r),
  );
  const barcode = useRef<SVGSVGElement>(null),
    s = confirmation.immutableSnapshot;
  useEffect(() => {
    if (barcode.current)
      JsBarcode(barcode.current, confirmation.reference, {
        format: "CODE128",
        width: 2,
        height: 64,
        displayValue: false,
        margin: 16,
        lineColor: "#153c20",
        background: "#fffefc",
      });
  }, [confirmation.reference]);
  return (
    <div className="ticket-wrap">
      <article className="confirmation-ticket">
        <header>
          <span className="ticket-check">
            <Check size={29} />
          </span>
          <span className="eyebrow">СТРАЙД · КЛУБ ДВИЖЕНИЯ</span>
          <h1>Всё получилось.</h1>
          <p>Ваш следующий шаг — к себе.</p>
        </header>
        <div className="ticket-body">
          <div className="ticket-amount">
            <div>
              <span className="eyebrow">АБОНЕМЕНТ</span>
              <h2>{s.title}</h2>
            </div>
            <strong>{money(s.amountMinor)}</strong>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Клиент</dt>
              <dd>{s.clientName}</dd>
            </div>
            <div>
              <dt>Дата и время</dt>
              <dd>{dateTime(s.date)} · МСК</dd>
            </div>
          </dl>
          <div className="ticket-method">
            <PayMark method={s.method} />
            <div>
              <strong>{methods[s.method]}</strong>
              <p>{s.maskedLast4 ? "•••• " + s.maskedLast4 : "Оплата прошла"}</p>
            </div>
          </div>
          <div className="ticket-barcode">
            <svg
              ref={barcode}
              role="img"
              aria-label={"Штрихкод подтверждения " + confirmation.reference}
            />
            <p>{confirmation.reference}</p>
          </div>
        </div>
        <footer>Подтверждение операции · Сохраните для истории</footer>
      </article>
      <div className="ticket-actions">
        <Button asChild>
          <Link
            href={
              (staff ? "/admin" : "/account") + "/memberships/" + s.membershipId
            }
          >
            Мой абонемент
            <ArrowUpRight size={16} />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/schedule">Выбрать тренировку</Link>
        </Button>
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer size={16} />
          Сохранить подтверждение
        </Button>
      </div>
    </div>
  );
}
