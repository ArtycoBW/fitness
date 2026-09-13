"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { api, workspace, type User } from "@/lib/api";
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    ["Направления", "/workouts"],
    ["Пространства", "/halls"],
    ["Тренеры", "/trainers"],
    ["Расписание", "/schedule"],
    ["Абонементы", "/memberships"],
  ];
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      document.cookie.split("; ").some((c) => c.startsWith("fitness_csrf="))
        ? api<User>("/auth/me")
        : Promise.resolve(null),
    retry: false,
  });
  return (
    <header className="public-header">
      <Link href="/" className="brand">
        страйд<span>клуб движения</span>
      </Link>
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <nav aria-label="Основная навигация">
        {links.map(([label, href]) => (
          <Link className="public-desktop-link" key={href} href={href!}>
            {label}
          </Link>
        ))}
        <Link href={user ? workspace(user) : "/login"} className="public-login">
          {user ? "Кабинет" : "Войти"}
        </Link>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="public-menu"
            aria-label="Открыть меню сайта"
          >
            <Menu size={22} />
          </button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Страйд</SheetTitle>
            <SheetDescription>Клуб движения</SheetDescription>
          </SheetHeader>
          <nav className="public-mobile-nav" aria-label="Меню сайта">
            {links.map(([label, href]) => (
              <Link key={href} href={href!} onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
            <Link href="/#contact" onClick={() => setOpen(false)}>
              Познакомиться с клубом
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
