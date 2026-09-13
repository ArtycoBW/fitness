"use client";
import { Progress as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
export function Progress({
  value = 0,
  max = 100,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root data-slot="progress" value={value} max={max} {...props}>
      <Primitive.Indicator
        style={{
          transform: `translateX(-${100 - Math.min(100, Math.max(0, (Number(value) / max) * 100))}%)`,
        }}
      />
    </Primitive.Root>
  );
}
