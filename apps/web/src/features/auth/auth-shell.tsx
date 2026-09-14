"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Brand } from "@/components/brand";
import { AuthArtCarousel } from "./art-carousel";

const authPaths = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/accept-invite",
]);

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const exit = useRef<Animation | null>(null);
  const recovery = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    exit.current?.cancel();
    exit.current = null;
    if (recovery.current) clearTimeout(recovery.current);
    return () => {
      exit.current?.cancel();
      if (recovery.current) clearTimeout(recovery.current);
    };
  }, [pathname]);
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <AuthArtCarousel />
        <Link className="brand" href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">МЕСТО ДЛЯ ВАШЕГО РИТМА</span>
          <h2>
            Сильнее.
            <br />
            Спокойнее.
            <br />
            <i>Ближе к себе.</i>
          </h2>
        </div>
        <div className="auth-art-foot">
          <span>Движение, которое остаётся с вами.</span>
        </div>
      </aside>
      <section
        className="auth-form-wrap"
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (
            !link ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            link.target === "_blank"
          )
            return;
          const url = new URL(link.href);
          if (
            url.origin !== location.origin ||
            !authPaths.has(url.pathname) ||
            url.pathname === pathname ||
            matchMedia("(prefers-reduced-motion: reduce)").matches
          )
            return;
          const form = event.currentTarget.querySelector(".auth-form");
          if (!form) return;
          event.preventDefault();
          event.stopPropagation();
          if (exit.current) return;
          exit.current = form.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 180,
            easing: "ease-out",
            fill: "forwards",
          });
          void exit.current.finished
            .then(() => {
              router.push(url.pathname + url.search);
              recovery.current = setTimeout(() => {
                exit.current?.cancel();
                exit.current = null;
              }, 3000);
            })
            .catch(() => {});
        }}
      >
        <Link href="/" className="auth-back">
          Вернуться на сайт
        </Link>
        {children}
        <span className="auth-footer">СТРАЙД · КЛУБ ДВИЖЕНИЯ</span>
      </section>
    </div>
  );
}
