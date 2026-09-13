"use client";
import { useState } from "react";
import { CreditCard, LockKeyhole } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { money } from "@/lib/format";
import { methods } from "@/features/payments/types";
export function PayMark({ method }: { method: string }) {
  const src: Record<string, string> = {
    ALFA_PAY: "alfa-pay",
    YANDEX_PAY: "yandex-pay",
    SBER_PAY: "sber-pay",
  };
  return (
    <span aria-hidden="true" className={"pay-mark " + method.toLowerCase()}>
      {src[method] ? (
        <img
          src={"/media/payments/" + src[method] + ".svg"}
          alt=""
          width={94}
          height={30}
        />
      ) : (
        <CreditCard size={19} />
      )}
    </span>
  );
}
function validCard(n: string) {
  return /^\d{13,19}$/.test(n);
}
export function ModernPaymentForm({
  amountMinor,
  onPay,
  pending,
  error,
}: {
  amountMinor: number;
  onPay: (method: string, last4?: string) => void;
  pending: boolean;
  error?: string;
}) {
  const [method, setMethod] = useState("CARD"),
    [validation, setValidation] = useState("");
  return (
    <section className="payment-form">
      <div className="payment-form-heading">
        <span className="eyebrow">СПОСОБ ОПЛАТЫ</span>
        <LockKeyhole size={18} />
      </div>
      <div className="pay-options">
        {["ALFA_PAY", "YANDEX_PAY", "SBER_PAY"].map((m) => (
          <Button
            type="button"
            key={m}
            variant="outline"
            aria-pressed={method === m}
            className={method === m ? "is-selected" : ""}
            disabled={pending}
            onClick={() => {
              setMethod(m);
              setValidation("");
            }}
          >
            <PayMark method={m} />
            <span>{methods[m]}</span>
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        className="card-option"
        type="button"
        aria-pressed={method === "CARD"}
        onClick={() => {
          setMethod("CARD");
          setValidation("");
        }}
        disabled={pending}
      >
        <CreditCard size={18} />
        Оплатить банковской картой
        <span
          className={"radio-dot " + (method === "CARD" ? "is-selected" : "")}
        />
      </Button>
      <form
        autoComplete="off"
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          if (method === "CARD") {
            const n = String(f.get("number")).replace(/\s/g, ""),
              expiry = String(f.get("expiry"));
            const [month, year] = expiry.split("/").map(Number);
            if (!validCard(n)) {
              setValidation("Проверьте номер карты");
              return;
            }
            if (
              !month ||
              month > 12 ||
              !year ||
              new Date(2000 + year, month, 1) <= new Date()
            ) {
              setValidation("Проверьте срок действия карты");
              return;
            }
            const last4 = n.slice(-4);
            form.reset();
            setValidation("");
            onPay(method, last4);
          } else onPay(method);
        }}
      >
        {method === "CARD" ? (
          <fieldset disabled={pending} className="form-stack" key={method}>
            <div className="field">
              <Label htmlFor="cardholder">Владелец карты</Label>
              <Input
                id="cardholder"
                name="holder"
                autoComplete="off"
                placeholder="Имя и фамилия"
                required
                minLength={3}
                maxLength={100}
              />
            </div>
            <div className="field">
              <Label htmlFor="card-number">Номер карты</Label>
              <Input
                id="card-number"
                name="number"
                autoComplete="off"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                required
                maxLength={23}
                pattern="[0-9 ]{13,23}"
                onInput={(e) => {
                  e.currentTarget.value = e.currentTarget.value
                    .replace(/\D/g, "")
                    .slice(0, 19)
                    .replace(/(.{4})/g, "$1 ")
                    .trim();
                }}
              />
            </div>
            <div className="payment-card-fields">
              <div className="field">
                <Label htmlFor="expiry">Срок действия</Label>
                <Input
                  id="expiry"
                  name="expiry"
                  placeholder="ММ/ГГ"
                  inputMode="numeric"
                  required
                  maxLength={5}
                  pattern="[0-9]{2}/[0-9]{2}"
                  onInput={(e) => {
                    const n = e.currentTarget.value
                      .replace(/\D/g, "")
                      .slice(0, 4);
                    e.currentTarget.value =
                      n.length > 2 ? n.slice(0, 2) + "/" + n.slice(2) : n;
                  }}
                />
              </div>
              <div className="field">
                <Label htmlFor="cvv">CVV / CVC</Label>
                <Input
                  id="cvv"
                  name="cvv"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  minLength={3}
                  maxLength={4}
                  pattern="[0-9]{3,4}"
                  placeholder="•••"
                />
              </div>
            </div>
          </fieldset>
        ) : (
          <div className="pay-selected">
            <PayMark method={method} />
            <h3>{methods[method]}</h3>
            <p>Подтвердите оплату абонемента на {money(amountMinor)}.</p>
            <span className="muted">
              Статус покупки появится на этой странице.
            </span>
          </div>
        )}
        {(validation || error) && (
          <p role="alert" className="form-error">
            {validation || error}
          </p>
        )}
        <Button size="lg" className="payment-submit" disabled={pending}>
          {pending ? "Обрабатываем оплату…" : "Оплатить " + money(amountMinor)}
        </Button>
      </form>
      <p className="payment-note">
        Подтверждение и абонемент сохранятся в вашем кабинете.
      </p>
    </section>
  );
}
