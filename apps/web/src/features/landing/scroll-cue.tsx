"use client";
import { useEffect, useRef } from "react";
import { Mouse } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ScrollCue({ suspended = false }: { suspended?: boolean }) {
  const root = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const sections = [
      ...document.querySelectorAll<HTMLElement>(
        ".landing-main > section, footer#footer",
      ),
    ];
    let frame = 0;
    const update = () => {
      frame = 0;
      const cue = root.current;
      if (!cue) return;
      const footer = document.getElementById("footer");
      const onFooter =
        !!footer && footer.getBoundingClientRect().top < innerHeight - 64;
      const hero = document.getElementById("home");
      cue.dataset.hidden = String(onFooter);
      cue.dataset.light = String(
        !!hero && hero.getBoundingClientRect().bottom > innerHeight - 48,
      );
      cue.tabIndex = onFooter ? -1 : 0;
      cue.setAttribute("aria-hidden", String(onFooter));
      const next = sections.find(
        (section) => section.getBoundingClientRect().top > 4,
      );
      cue.href = "#" + (next?.id ?? "footer");
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, []);
  return (
    <Button
      asChild
      variant="ghost"
      className="scroll-cue"
      style={suspended ? { visibility: "hidden" } : undefined}
    >
      <a ref={root} href="#club" aria-label="Прокрутить к следующему разделу">
        <Mouse size={27} strokeWidth={1.35} />
        <span className="scroll-wheel" />
      </a>
    </Button>
  );
}
