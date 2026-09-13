export const passwordRules = [
  {
    id: "length",
    label: "От 12 до 128 символов",
    test: (v: string) => v.length >= 12 && v.length <= 128,
  },
  {
    id: "case",
    label: "Заглавные и строчные буквы",
    test: (v: string) => /\p{Ll}/u.test(v) && /\p{Lu}/u.test(v),
  },
  {
    id: "digit",
    label: "Хотя бы одна цифра",
    test: (v: string) => /\d/.test(v),
  },
  {
    id: "symbol",
    label: "Хотя бы один специальный символ",
    test: (v: string) => /[^\p{L}\p{N}\s]/u.test(v),
  },
] as const;
export const isGuessablePassword = (value: string) =>
  /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i.test(
    value,
  ) ||
  /(.)\1{3,}/u.test(value) ||
  /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i.test(
    value,
  );
export function passwordError(value: string): string | null {
  const missing = passwordRules
    .filter((r) => !r.test(value))
    .map((r) => r.label);
  if (missing.length) return missing.join(". ");
  if (isGuessablePassword(value))
    return "Избегайте распространённых паролей, последовательностей и повторов";
  return null;
}
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^[78]\d{10}$/.test(digits)) return "+7" + digits.slice(1);
  if (/^\d{10}$/.test(digits)) return "+7" + digits;
  return null;
}
export function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits[0] === "7" || digits[0] === "8") digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let result = "+7";
  if (digits.length) result += " (" + digits.slice(0, 3);
  if (digits.length >= 3) result += ")";
  if (digits.length > 3) result += " " + digits.slice(3, 6);
  if (digits.length > 6) result += "-" + digits.slice(6, 8);
  if (digits.length > 8) result += "-" + digits.slice(8, 10);
  return result;
}
