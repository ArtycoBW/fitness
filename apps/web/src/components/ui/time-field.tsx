"use client";
import * as React from "react";
import { SelectField } from "./select-field";
import { DateField } from "./date-field";
export function TimeField({
  value,
  defaultValue,
  onChange,
  name,
  id,
  type,
  disabled,
  required,
  min,
  max,
  ...props
}: React.ComponentProps<"input">) {
  const [local, setLocal] = React.useState(String(defaultValue ?? ""));
  const current = String(value ?? local),
    dateTime = type === "datetime-local";
  const [day, clock] = dateTime ? current.split("T") : ["", current];
  const [hour, minute] = (clock || "").split(":");
  const update = (date: string, time: string) => {
    const val = dateTime ? (date && time ? date + "T" + time : "") : time;
    setLocal(val);
    const target = { value: val, name: name ?? "", type } as HTMLInputElement;
    onChange?.({
      target,
      currentTarget: target,
    } as React.ChangeEvent<HTMLInputElement>);
  };
  return (
    <div className="time-field" role="group" aria-label={props["aria-label"]}>
      <input type="hidden" name={name} value={current} />
      {dateTime && (
        <DateField
          id={id}
          value={day ?? ""}
          required={required}
          disabled={disabled}
          min={String(min ?? "").split("T")[0]}
          max={String(max ?? "").split("T")[0]}
          onChange={(e) => update(e.target.value, clock || "09:00")}
        />
      )}
      <SelectField
        id={dateTime ? undefined : id}
        aria-label="Часы"
        value={hour ?? ""}
        disabled={disabled}
        onChange={(e) =>
          update(day ?? "", e.target.value + ":" + (minute || "00"))
        }
      >
        <option value="">Часы</option>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(
          (h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ),
        )}
      </SelectField>
      <span>:</span>
      <SelectField
        aria-label="Минуты"
        value={minute ?? ""}
        disabled={disabled}
        onChange={(e) =>
          update(day ?? "", (hour || "09") + ":" + e.target.value)
        }
      >
        <option value="">Минуты</option>
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
          (m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ),
        )}
      </SelectField>
    </div>
  );
}
