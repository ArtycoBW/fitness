export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
function csrf() {
  return typeof document === "undefined"
    ? ""
    : (document.cookie
        .split("; ")
        .find((v) => v.startsWith("fitness_csrf="))
        ?.slice("fitness_csrf=".length) ?? "");
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf(),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({
    error: { code: "NETWORK_ERROR", message: "Сервис временно недоступен" },
  }));
  if (!response.ok)
    throw new ApiError(
      body.error?.code ?? "ERROR",
      Array.isArray(body.error?.message)
        ? body.error.message.join(". ")
        : (body.error?.message ?? "Не удалось выполнить действие"),
      response.status,
      body.error?.details,
    );
  return body as T;
}
export const post = <T>(path: string, data: unknown = {}, key?: string) =>
  api<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
    ...(key ? { headers: { "Idempotency-Key": key } } : {}),
  });
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  avatarUrl: string | null;
  roles: string[];
  clientId: string | null;
  trainerId: string | null;
  client: { id: string; phone: string | null } | null;
}
export function workspace(user: User) {
  return user.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r))
    ? "/admin"
    : user.roles.includes("TRAINER")
      ? "/trainer"
      : "/account";
}
