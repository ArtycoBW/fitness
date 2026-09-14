"use client";

import { useEffect, useState } from "react";
import TetrisLoading from "@/components/ui/tetris-loader";

export function SiteIntro() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro !== "pending") return;
    const app = document.getElementById("site-content");
    if (app) app.inert = true;
    const start =
      (window as Window & { __strideIntroStart?: number }).__strideIntroStart ??
      performance.now();
    const activate = requestAnimationFrame(() => setActive(true));
    const fade = setTimeout(
      () => {
        html.dataset.intro = "leaving";
      },
      Math.max(0, 2500 - (performance.now() - start)),
    );
    const finish = setTimeout(
      () => {
        delete html.dataset.intro;
        if (app) app.inert = false;
        try {
          localStorage.setItem("stride-intro-seen", "1");
        } catch {
          /* Storage can be unavailable in private browsing. */
        }
        setActive(false);
      },
      Math.max(0, 3000 - (performance.now() - start)),
    );
    return () => {
      cancelAnimationFrame(activate);
      clearTimeout(fade);
      clearTimeout(finish);
      if (app) app.inert = false;
    };
  }, []);
  return (
    <div className="site-intro" role="status" aria-label="Загружаем Страйд">
      <span className="site-intro-brand">СТРАЙД</span>
      {active && <TetrisLoading />}
      <span className="site-intro-caption">КЛУБ ДВИЖЕНИЯ</span>
    </div>
  );
}
