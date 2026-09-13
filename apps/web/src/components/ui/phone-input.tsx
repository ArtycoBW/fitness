"use client";
import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { formatPhone, normalizePhone } from "@fitness/validation";
import { Input } from "./input";
export function PhoneInput({
  defaultValue,
  onChange,
  ...props
}: ComponentProps<"input">) {
  const [value, setValue] = useState(() =>
    formatPhone(String(defaultValue ?? "")),
  );
  const input = useRef<HTMLInputElement>(null),
    caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);
  return (
    <Input
      {...props}
      ref={input}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+7 (999) 123-45-67"
      value={value}
      maxLength={18}
      onKeyDown={(event) => {
        const node = event.currentTarget;
        const start = node.selectionStart ?? 0;
        if (
          event.key === "Backspace" &&
          start === node.selectionEnd &&
          start > 4 &&
          /\D/.test(node.value[start - 1]!)
        ) {
          let previous = start - 1;
          while (previous > 3 && /\D/.test(node.value[previous]!)) previous--;
          node.setSelectionRange(previous, start);
        }
        props.onKeyDown?.(event);
      }}
      onChange={(event) => {
        const node = event.currentTarget;
        const count = node.value
          .slice(0, node.selectionStart ?? node.value.length)
          .replace(/\D/g, "").length;
        const next = formatPhone(node.value);
        let digits = 0,
          pos = 0;
        while (pos < next.length && digits < count) {
          if (/\d/.test(next[pos]!)) digits++;
          pos++;
        }
        caret.current =
          node.selectionStart === node.value.length ? next.length : pos;
        setValue(next);
        node.setCustomValidity(
          next && !normalizePhone(next)
            ? "Введите номер полностью: +7 (999) 123-45-67"
            : "",
        );
        onChange?.(event);
      }}
    />
  );
}
