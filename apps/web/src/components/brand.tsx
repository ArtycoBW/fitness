import Image from "next/image";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup">
      <Image
        className="brand-symbol"
        src="/media/editorial/logo.webp"
        alt=""
        width={44}
        height={44}
      />
      <span className={compact ? "sr-only" : "brand-type"}>
        страйд<small>клуб движения</small>
      </span>
    </span>
  );
}
