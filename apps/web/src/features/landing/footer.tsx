"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
// The supplied CinematicFooter: large background wordmark, moving ribbon and scroll-linked reveal.
export function PublicFooter() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    let cleanup = () => {},
      cancelled = false;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          gsap.fromTo(
            root.current?.querySelector(".footer-center") ?? [],
            { y: 90, opacity: 0.2 },
            {
              y: 0,
              opacity: 1,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top bottom",
                end: "top 15%",
                scrub: 0.7,
              },
            },
          );
        });
        cleanup = () => mm.revert();
      },
    );
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  return (
    <footer ref={root} id="footer" className="landing-footer cinematic-footer">
      <div className="footer-ribbon" aria-hidden="true">
        <div className="footer-marquee-track">
          {[0, 1].map((group) => (
            <div className="footer-marquee-group" key={group}>
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i}>
                  {i % 2 ? "Движение в вашем ритме" : "Сила быть собой"}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="footer-ghost-word" aria-hidden="true">
        страйд
      </div>
      <div className="footer-center">
        <Brand />
        <h2>
          Продолжение
          <br />
          <em>начинается с вас.</em>
        </h2>
        <div className="footer-primary">
          <Button asChild size="lg">
            <Link href="/#timetable">Выбрать тренировку</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">Создать аккаунт</Link>
          </Button>
        </div>
        <nav aria-label="Разделы клуба">
          <Link href="/#directions">Направления</Link>
          <Link href="/#spaces">Пространства</Link>
          <Link href="/#team">Тренеры</Link>
          <Link href="/#contact">Контакты</Link>
        </nav>
      </div>
      <div className="footer-meta">
        <span>© {new Date().getFullYear()} Страйд</span>
        <Link href="/privacy">Конфиденциальность</Link>
        <Link href="/terms">Условия клуба</Link>
        <Button asChild variant="ghost">
          <a href="#home">Наверх</a>
        </Button>
      </div>
    </footer>
  );
}
