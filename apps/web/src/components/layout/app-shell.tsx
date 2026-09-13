"use client";
import Link from "next/link";
import { toast } from "sonner";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  UserRound,
  LogOut,
  ArrowUpRight,
  ShieldCheck,
  Users,
  Dumbbell,
  DoorOpen,
  Activity,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import { api, post, workspace, type User, ApiError } from "@/lib/api";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
export const adminNavigation = [
  { path: "schedule", label: "Расписание", icon: CalendarDays },
  { path: "clients", label: "Клиенты", icon: Users },
  { path: "trainers", label: "Тренеры", icon: Dumbbell },
  { path: "halls", label: "Залы", icon: DoorOpen },
  { path: "workouts", label: "Направления", icon: Activity },
  { path: "membership-plans", label: "Тарифы", icon: CreditCard },
  { path: "memberships", label: "Абонементы", icon: CreditCard },
  { path: "payments", label: "Оплаты", icon: CreditCard },
];
export function AppShell({
  children,
  area,
}: {
  children: React.ReactNode;
  area: "account" | "trainer" | "admin";
}) {
  const router = useRouter(),
    path = usePathname(),
    qc = useQueryClient();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/auth/me") });
  const permitted =
    user &&
    (area === "account"
      ? user.roles.includes("CLIENT")
      : area === "trainer"
        ? user.roles.includes("TRAINER")
        : user.roles.some((r) => ["OWNER", "ADMIN", "RECEPTION"].includes(r)));
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401)
      router.replace("/login?next=" + encodeURIComponent(path));
  }, [error, path, router]);
  if (isLoading)
    return (
      <div className="app-loading">
        <div className="loading-bar" />
        <p>Открываем кабинет</p>
      </div>
    );
  if (error)
    return (
      <div className="app-loading">
        <p>{error.message}</p>
        <Link href="/login">Войти в аккаунт</Link>
      </div>
    );
  if (!user) return null;
  if (!permitted)
    return (
      <div className="app-loading">
        <ShieldCheck />
        <h1>Раздел недоступен</h1>
        <Link href={workspace(user)}>В свой кабинет</Link>
      </div>
    );
  const root = "/" + area;
  const logout = async () => {
    await post("/auth/logout");
    qc.clear();
    router.replace("/login");
  };
  return (
    <Sidebar>
      <div className="app-shell">
        <SidebarBody>
          <Link href="/" className="brand">
            страйд<span>клуб движения</span>
          </Link>
          <div className="sidebar-caption">
            {area === "admin"
              ? "Рабочее пространство"
              : area === "trainer"
                ? "Кабинет тренера"
                : "Личный кабинет"}
          </div>
          <nav className="sidebar-nav">
            <SidebarLink
              href={root}
              label="Обзор"
              icon={<LayoutDashboard size={20} />}
            />
            {area === "admin" &&
              adminNavigation.map((item) => (
                <SidebarLink
                  key={item.path}
                  href={"/admin/" + item.path}
                  label={item.label}
                  icon={<item.icon size={20} />}
                />
              ))}
            {area === "account" && (
              <>
                <SidebarLink
                  href="/account/memberships"
                  label="Абонементы"
                  icon={<CreditCard size={20} />}
                />
                <SidebarLink
                  href="/account/payments"
                  label="Оплаты"
                  icon={<CreditCard size={20} />}
                />
              </>
            )}
            {area === "trainer" && (
              <>
                <SidebarLink
                  href="/trainer/schedule"
                  label="Расписание"
                  icon={<CalendarDays size={20} />}
                />
                <SidebarLink
                  href="/trainer/clients"
                  label="Мои клиенты"
                  icon={<Users size={20} />}
                />
                <SidebarLink
                  href="/trainer/availability"
                  label="Доступность"
                  icon={<Activity size={20} />}
                />
              </>
            )}
            <SidebarLink
              href={root + "/profile"}
              label="Профиль"
              icon={<UserRound size={20} />}
            />
          </nav>
          <div className="sidebar-bottom">
            <Link href="/" className="sidebar-link">
              <ArrowUpRight size={20} />
              <span>На сайт клуба</span>
            </Link>
            <button className="sidebar-link" onClick={() => void logout()}>
              <LogOut size={20} />
              <span>Выйти</span>
            </button>
          </div>
        </SidebarBody>
        <div className="app-main">
          <header className="app-header">
            <span>
              {area === "admin"
                ? "Управление клубом"
                : area === "trainer"
                  ? "Команда клуба"
                  : "Ваше пространство"}
            </span>
            <div className="user-chip">
              <span>{user.name}</span>
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            </div>
          </header>
          <main className="workspace-main">
            {!user.emailVerifiedAt && (
              <div className="notice">
                Подтвердите email, чтобы покупать абонементы и записываться.{" "}
                <button
                  onClick={() =>
                    void post("/auth/resend-verification")
                      .then(() => toast.success("Письмо отправлено"))
                      .catch((e) => toast.error(e.message))
                  }
                >
                  Отправить письмо
                </button>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </Sidebar>
  );
}
