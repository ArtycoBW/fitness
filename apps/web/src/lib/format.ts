export const dateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const dateOnly = (value: string | Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
export const money = (kopecks: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: kopecks % 100 ? 2 : 0,
  }).format(kopecks / 100);
export const inputToUtc = (value: string) =>
  new Date(
    value.length === 16 ? value + ":00+03:00" : value + "+03:00",
  ).toISOString();
export const visits = (value: number) =>
  value +
  " " +
  ({
    zero: "посещений",
    two: "посещения",
    one: "посещение",
    few: "посещения",
    many: "посещений",
    other: "посещения",
  }[new Intl.PluralRules("ru-RU").select(value)] ?? "посещений");
