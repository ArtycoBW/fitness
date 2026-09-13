"use client";
import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { PasswordStrength } from "./password-strength";
import { passwordError } from "@fitness/validation";
export function PasswordInput({
  strength = false,
  onChange,
  ...props
}: ComponentProps<"input"> & { strength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(
    String(props.defaultValue ?? props.value ?? ""),
  );
  const hint = useId();
  return (
    <div className="password-field">
      <div className="password-control">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          aria-describedby={
            [props["aria-describedby"], strength ? hint : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(event) => {
            setValue(event.target.value);
            if (strength)
              event.target.setCustomValidity(
                passwordError(event.target.value) ?? "",
              );
            onChange?.(event);
          }}
        />
        <Button
          variant="ghost"
          type="button"
          className="password-eye"
          disabled={props.disabled}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </div>
      {strength && (
        <div id={hint}>
          <PasswordStrength value={String(props.value ?? value)} />
        </div>
      )}
    </div>
  );
}
