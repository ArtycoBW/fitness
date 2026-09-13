"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
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
// Adapted from the supplied AnimatedNavFramer, with keyboard-safe collapsed navigation.
export function PublicHeader() {
  const [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(true);
  const path = usePathname(),
    reduce = useReducedMotion(),
    { scrollY } = useScroll();
  const last = useRef(0),
    travel = useRef(0),
    header = useRef<HTMLElement>(null);
  useMotionValueEvent(scrollY, "change", (y) => {
    if (window.matchMedia("(max-width:1000px)").matches) {
      setExpanded(true);
      return;
    }
    const delta = y - last.current;
    travel.current =
      Math.sign(delta) === Math.sign(travel.current)
        ? travel.current + delta
        : delta;
    if (y < 100 || travel.current < -70) setExpanded(true);
    else if (
      y > 180 &&
      travel.current > 80 &&
      !header.current?.contains(document.activeElement)
    )
      setExpanded(false);
    last.current = y;
  });
  const links = [
    ["Направления", "directions"],
    ["Пространства", "spaces"],
    ["Тренеры", "team"],
    ["Расписание", "timetable"],
    ["Абонементы", "plans"],
  ];
  const href = (id: string) => (path === "/" ? "" : "/") + "#" + id;
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
      ref={header}
      className="public-header floating-header"
      data-expanded={expanded}
    >
      <a href="#main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <motion.div
        className="nav-capsule"
        layout
        transition={{ duration: reduce ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="nav-expanded" inert={!expanded}>
          <Link
            href={href("home")}
            className="brand"
            aria-label="Страйд — главная"
          >
            <Brand />
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
        {!expanded && (
          <Button
            variant="ghost"
            className="nav-expand"
            aria-label="Развернуть навигацию"
            onClick={() => {
              setExpanded(true);
              travel.current = 0;
            }}
          >
            <Menu size={22} />
          </Button>
        )}
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
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                <Brand />
              </SheetTitle>
              <SheetDescription>Найдите свой ритм</SheetDescription>
            </SheetHeader>
            <nav className="public-mobile-nav" aria-label="Меню сайта">
              {links.map(([label, id]) => (
                <Link key={id} href={href(id!)} onClick={() => setOpen(false)}>
                  {label}
                </Link>
              ))}
              <Link href={href("contact")} onClick={() => setOpen(false)}>
                Познакомиться с клубом
              </Link>
              <Link href={user ? workspace(user) : "/login"}>
                {user ? "Личный кабинет" : "Войти"}
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </motion.div>
    </header>
  );
}
