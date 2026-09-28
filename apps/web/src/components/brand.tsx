import Image from "next/image";
export function Brand({
  compact = false,
  light = false,
}: {
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <span className="brand-lockup">
      <Image
        className="brand-symbol"
        src={
          light
            ? "/media/editorial/logo-white.webp"
            : "/media/editorial/logo.webp"
        }
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
