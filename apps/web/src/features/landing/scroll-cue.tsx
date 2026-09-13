import { Mouse } from "lucide-react";
export function ScrollCue({ target }: { target: string }) {
  return (
    <a
      className="scroll-cue"
      href={"#" + target}
      aria-label="Прокрутить к следующему разделу"
    >
      <Mouse size={27} strokeWidth={1.35} />
      <span className="scroll-wheel" />
      <span className="sr-only">Листайте вниз</span>
    </a>
  );
}
