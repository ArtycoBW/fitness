"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useScroll, useMotionValueEvent, useReducedMotion } from "motion/react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { useQuery } from "@tanstack/react-query";
import { api, workspace, type User } from "@/lib/api";
// Adapted from the supplied AnimatedNavFramer; the capsule stays centered while scrolling.
export function PublicHeader() {
  const [open, setOpen] = useState(false),
    [onHero, setOnHero] = useState(true);
  const path = usePathname(),
    reduce = useReducedMotion(),
    { scrollY } = useScroll();
  const pendingAnchor = useRef<string | null>(null);
  useEffect(() => {
    const update = () => setOnHero(window.scrollY < window.innerHeight - 100);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [path]);
  useMotionValueEvent(scrollY, "change", (y) => {
    setOnHero(y < window.innerHeight - 100);
  });
  const links = [
    ["Направления", "directions"],
    ["Пространства", "spaces"],
    ["Тренеры", "team"],
    ["Расписание", "timetable"],
    ["Абонементы", "plans"],
  ];
  const href = (id: string) => (path === "/" ? "" : "/") + "#" + id;
  const chooseAnchor = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    pendingAnchor.current = id;
    setOpen(false);
    if (path === "/") event.preventDefault();
  };
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      document.cookie.split("; ").some((c) => c.startsWith("fitness_csrf="))
        ? api<User>("/auth/me")
        : Promise.resolve(null),
    retry: false,
  });
  return (
    <header
      className="public-header floating-header"
      data-landing={path === "/"}
      data-on-hero={path === "/" && onHero}
    >
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <div className="nav-capsule">
        <div className="nav-expanded">
          <Link
            href={href("home")}
            className="brand"
            aria-label="Страйд — главная"
          >
            <Brand light={path === "/" && onHero} />
          </Link>
          <nav aria-label="Основная навигация">
            {links.map(([label, id]) => (
              <Link className="public-desktop-link" key={id} href={href(id!)}>
                {label}
              </Link>
            ))}
          </nav>
          <Button asChild size="sm">
            <Link href={user ? workspace(user) : "/login"}>
              {user ? "Кабинет" : "Войти"}
            </Link>
          </Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="public-menu"
              aria-label="Открыть меню сайта"
            >
              <Menu size={22} />
            </Button>
          </SheetTrigger>
          <SheetContent
            onCloseAutoFocus={(event) => {
              const id = pendingAnchor.current;
              if (!id) return;
              event.preventDefault();
              pendingAnchor.current = null;
              if (path !== "/") return;
              // Wait for the modal scroll lock to release before moving the page.
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const section = document.getElementById(id);
                  if (!section) return;
                  const heading =
                    section.querySelector<HTMLElement>("h1, h2") ?? section;
                  heading.setAttribute("tabindex", "-1");
                  heading.focus({ preventScroll: true });
                  window.history.pushState(null, "", "#" + id);
                  section.scrollIntoView({
                    block: "start",
                    behavior: reduce ? "instant" : "smooth",
                  });
                }),
              );
            }}
          >
            <SheetHeader>
              <SheetTitle>
                <Brand />
              </SheetTitle>
              <SheetDescription>Найдите свой ритм</SheetDescription>
            </SheetHeader>
            <nav className="public-mobile-nav" aria-label="Меню сайта">
              {links.map(([label, id]) => (
                <Link
                  key={id}
                  href={href(id!)}
                  onClick={(event) => chooseAnchor(event, id!)}
                >
                  {label}
                </Link>
              ))}
              <Link
                href={href("contact")}
                onClick={(event) => chooseAnchor(event, "contact")}
              >
                Познакомиться с клубом
              </Link>
              <Link href={user ? workspace(user) : "/login"}>
                {user ? "Личный кабинет" : "Войти"}
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
