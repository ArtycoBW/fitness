"use client";
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
const EMPTY = "__stride_empty__";
// Compatibility boundary for existing FormData and change-event based forms.
export function SelectField({
  children,
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  id,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [local, setLocal] = React.useState<string | null>(
    defaultValue === undefined ? null : String(defaultValue),
  );
  const options: {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
  }[] = [];
  const collect = (nodes: React.ReactNode) =>
    React.Children.forEach(nodes, (node) => {
      if (
        !React.isValidElement<{
          value?: string | number;
          children?: React.ReactNode;
          disabled?: boolean;
        }>(node)
      )
        return;
      if (node.type === "option")
        options.push({
          value: String(node.props.value ?? node.props.children ?? ""),
          label: node.props.children,
          disabled: node.props.disabled,
        });
      else if (node.props.children) collect(node.props.children);
    });
  collect(children);
  const current = String(value ?? local ?? options[0]?.value ?? "");
  return (
    <>
      <input type="hidden" name={name} value={current} disabled={disabled} />
      <Select
        required={required}
        disabled={disabled}
        value={current || EMPTY}
        onValueChange={(next) => {
          const val = next === EMPTY ? "" : next;
          setLocal(val);
          const target = { value: val, name: name ?? "" } as HTMLSelectElement;
          onChange?.({
            target,
            currentTarget: target,
          } as React.ChangeEvent<HTMLSelectElement>);
        }}
      >
        <SelectTrigger
          id={id}
          className={className}
          aria-label={props["aria-label"]}
          aria-describedby={props["aria-describedby"]}
          aria-invalid={props["aria-invalid"]}
        >
          <SelectValue placeholder="Выберите значение" />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((option, i) => (
            <SelectItem
              key={option.value + i}
              data-value={option.value}
              value={option.value || EMPTY}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
