import type { Principal } from "../modules/auth/access";
import { fail } from "./business-error";
export function areaPrincipal(
  auth: Principal,
  area?: "admin" | "trainer" | "account",
): Principal {
  if (!area) return auth;
  if (area === "admin") {
    if (!auth.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r)))
      fail("FORBIDDEN", "Рабочее пространство недоступно", 403);
    return auth;
  }
  if (area === "trainer") {
    if (!auth.roles.includes("TRAINER") || !auth.trainerId)
      fail("FORBIDDEN", "Кабинет тренера недоступен", 403);
    return { ...auth, roles: ["TRAINER"], clientId: null };
  }
  if (!auth.roles.includes("CLIENT") || !auth.clientId)
    fail("FORBIDDEN", "Кабинет клиента недоступен", 403);
  return { ...auth, roles: ["CLIENT"], trainerId: null };
}
