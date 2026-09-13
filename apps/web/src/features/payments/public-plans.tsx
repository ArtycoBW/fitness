"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ArrowUpRight } from "lucide-react";
import { api, post, type User } from "@/lib/api";
import { money, visits } from "@/lib/format";
import { localDay, addDays } from "@/features/schedule/types";
import type { Plan } from "@/features/memberships/plans";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function PublicPlans() {
  const { data, error } = useQuery({
      queryKey: ["public-plans"],
      queryFn: () => api<Plan[]>("/public/membership-plans"),
    }),
    { data: user } = useQuery({
      queryKey: ["me"],
      queryFn: () => api<User>("/auth/me"),
      retry: false,
    });
  const [selected, setSelected] = useState<Plan | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID()),
    router = useRouter();
  const buy = useMutation({
    mutationFn: (date: string) =>
      post<{ id: string }>(
        "/orders",
        { planVersionId: selected?.versions[0]?.id, activationDate: date },
        key,
      ),
    onSuccess: (o) => router.push("/checkout/" + o.id),
  });
  const v = selected?.versions[0];
  return (
    <>
      <PublicHeader />
      <main className="public-plans">
        <div className="public-plans-heading">
          <span className="eyebrow">НАЧНИТЕ В СВОЁМ ТЕМПЕ</span>
          <h1>
            Ваш ритм.
            <br />
            <em>Ваш абонемент.</em>
          </h1>
          <p>
            Одно занятие для знакомства или движение как часть жизни. Выберите
            то, что подходит вам сейчас.
          </p>
        </div>
        {error && <p className="form-error">{error.message}</p>}
        <div className="public-plan-grid">
          {data?.map((p, i) => {
            const v = p.versions[0];
            if (!v) return null;
            return (
              <article
                key={p.id}
                className={"public-plan " + (i === 1 ? "featured" : "")}
              >
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")} / СТРАЙД
                </span>
                <h2>{p.name}</h2>
                <p>{v.description}</p>
                <div className="public-plan-price">
                  {money(v.priceMinor)}
                  <span>на {v.durationDays} дней</span>
                </div>
                <ul>
                  <li>
                    <Check size={16} />
                    {v.visitLimit === null
                      ? "Безлимитные посещения"
                      : visits(v.visitLimit)}
                  </li>
                  <li>
                    <Check size={16} />
                    {v.freezeQuotaDays
                      ? v.freezeQuotaDays + " дней заморозки"
                      : "Фиксированный срок"}
                  </li>
                  <li>
                    <Check size={16} />
                    {v.workouts.length
                      ? v.workouts.map((w) => w.name).join(", ")
                      : "Все направления клуба"}
                  </li>
                </ul>
                <Button
                  variant={i === 1 ? "secondary" : "default"}
                  onClick={() => {
                    buy.reset();
                    setSelected(p);
                    setKey(crypto.randomUUID());
                  }}
                >
                  Выбрать абонемент
                  <ArrowUpRight size={17} />
                </Button>
              </article>
            );
          })}
        </div>
        <p className="plans-footnote">
          Запись на занятия открывается отдельно после оформления абонемента.
          Время клуба — московское.
        </p>
      </main>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Выберите день, с которого начнётся действие абонемента.
            </DialogDescription>
          </DialogHeader>
          {!user ? (
            <div className="form-stack">
              <p>
                Войдите в кабинет, чтобы сохранить покупку и записываться на
                занятия.
              </p>
              <Button asChild>
                <Link href="/login?next=%2Fmemberships">Войти</Link>
              </Button>
              <Link href="/register">Создать аккаунт</Link>
            </div>
          ) : !user.clientId ? (
            <p>
              Для продажи клиенту откройте раздел «Оплаты» в рабочем кабинете.
            </p>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                buy.mutate(String(new FormData(e.currentTarget).get("date")));
              }}
            >
              <Label htmlFor="activation-date">Первый день</Label>
              <Input
                id="activation-date"
                name="date"
                type="date"
                min={localDay()}
                max={addDays(localDay(), v?.activationWindowDays ?? 30)}
                defaultValue={localDay()}
                required
              />
              <p className="muted">
                Стоимость {money(v?.priceMinor ?? 0)}. Срок — {v?.durationDays}{" "}
                дней.
              </p>
              {buy.error && <p className="form-error">{buy.error.message}</p>}
              <Button disabled={buy.isPending}>Перейти к оплате</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
