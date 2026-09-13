"use client";
import * as React from "react";
import { format, parseISO, isValid } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
export function DateField({
  value,
  defaultValue,
  onChange,
  className,
  id,
  name,
  min,
  max,
  disabled,
  required,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  const [local, setLocal] = React.useState(String(defaultValue ?? ""));
  const [open, setOpen] = React.useState(false);
  const current = String(value ?? local),
    date = current ? parseISO(current) : undefined;
  const selected = date && isValid(date) ? date : undefined;
  const change = (next: string) => {
    setLocal(next);
    const target = {
      value: next,
      name: name ?? "",
      type: "date",
    } as HTMLInputElement;
    onChange?.({
      target,
      currentTarget: target,
    } as React.ChangeEvent<HTMLInputElement>);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input ref={ref} type="hidden" name={name} value={current} />
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={"date-field " + (className ?? "")}
          disabled={disabled}
          aria-label={props["aria-label"]}
          aria-describedby={props["aria-describedby"]}
          aria-required={required}
        >
          <span>
            {selected
              ? format(selected, "d MMM yyyy", { locale: ru })
              : "Выберите дату"}
          </span>
          <CalendarDays size={17} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ru}
          selected={selected}
          defaultMonth={selected}
          captionLayout="label"
          startMonth={new Date(1920, 0)}
          endMonth={new Date(2100, 11)}
          disabled={(day) =>
            !!(
              (min && day < parseISO(String(min))) ||
              (max && day > parseISO(String(max)))
            )
          }
          onSelect={(day) => {
            if (day) change(format(day, "yyyy-MM-dd"));
            else if (!required) change("");
            setOpen(false);
          }}
        />
        {!required && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              change("");
              setOpen(false);
            }}
          >
            Очистить дату
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
