"use client";
import * as React from "react";
import { Checkbox } from "./checkbox";
export function CheckboxField({
  ref,
  className,
  id,
  checked,
  defaultChecked,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  const native = React.useRef<HTMLInputElement>(null);
  const [local, setLocal] = React.useState(!!defaultChecked);
  return (
    <>
      <Checkbox
        id={id}
        className={className}
        checked={checked ?? local}
        disabled={props.disabled}
        required={props.required}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={props["aria-invalid"]}
        onCheckedChange={() => native.current?.click()}
        onBlur={props.onBlur as React.FocusEventHandler<HTMLButtonElement>}
      />
      <input
        {...props}
        type="checkbox"
        ref={(node) => {
          native.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        checked={checked}
        defaultChecked={defaultChecked}
        tabIndex={-1}
        aria-hidden="true"
        className="checkbox-native"
        onChange={(event) => {
          setLocal(event.target.checked);
          onChange?.(event);
        }}
      />
    </>
  );
}
