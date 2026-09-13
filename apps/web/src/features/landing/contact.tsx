"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { post } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
export function ContactForm() {
  const [key] = useState(() => crypto.randomUUID());
  const send = useMutation({
    mutationFn: (body: unknown) => post("/public/leads", body, key),
  });
  if (send.isSuccess)
    return (
      <div className="contact-success" role="status">
        <span>✓</span>
        <h3>До скорой встречи.</h3>
        <p>
          Получили ваше обращение. Администратор свяжется с вами и поможет
          выбрать удобное время.
        </p>
        <Link href="/schedule" className="table-link">
          Посмотреть расписание →
        </Link>
      </div>
    );
  return (
    <form
      className="contact-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        send.mutate({
          name: f.get("name"),
          phone: f.get("phone"),
          email: f.get("email") || null,
          message: f.get("message"),
          website: f.get("website"),
          consent: f.has("consent"),
        });
      }}
    >
      <div className="contact-fields">
        <div>
          <Label htmlFor="contact-name">Ваше имя</Label>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="Как к вам обращаться"
          />
        </div>
        <div>
          <Label htmlFor="contact-phone">Телефон</Label>
          <Input
            id="contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            minLength={10}
            maxLength={20}
            placeholder="+7 (___) ___-__-__"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="contact-email">
          Электронная почта <span className="muted">· необязательно</span>
        </Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <Label htmlFor="contact-message">Расскажите о себе</Label>
        <textarea
          id="contact-message"
          name="message"
          className="form-textarea"
          rows={3}
          required
          minLength={3}
          maxLength={2000}
          placeholder="Что хотите попробовать, когда удобно заниматься…"
        />
      </div>
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="contact-consent">
        <input type="checkbox" name="consent" required />
        <span>
          Согласен на обработку персональных данных по{" "}
          <Link href="/privacy">политике конфиденциальности</Link> для ответа на
          обращение.
        </span>
      </label>
      {send.error && (
        <p className="form-error" role="alert">
          {send.error.message}
        </p>
      )}
      <Button disabled={send.isPending} size="lg">
        {send.isPending ? "Отправляем…" : "Познакомиться с клубом"}{" "}
        <span aria-hidden="true">↗</span>
      </Button>
    </form>
  );
}
