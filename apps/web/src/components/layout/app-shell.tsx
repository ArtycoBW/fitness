"use client";
import Link from "next/link";
import Image from "next/image";
import {
  Bell,
  ChartNoAxesCombined,
  MessageSquare,
  Settings,
  History,
  Mail,
} from "lucide-react";
import { NotificationBell } from "@/features/operations/notifications";
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
  { path: "bookings", label: "Записи и посещения", icon: Users },
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
              href={root + "/notifications"}
              label="Уведомления"
              icon={<Bell size={20} />}
            />
            {area !== "account" && (
              <SidebarLink
                href={root + "/reports"}
                label="Отчёты"
                icon={<ChartNoAxesCombined size={20} />}
              />
            )}
            {area === "admin" && (
              <SidebarLink
                href="/admin/leads"
                label="Обращения"
                icon={<MessageSquare size={20} />}
              />
            )}
            {area === "admin" &&
              user.roles.some((r) => ["OWNER", "ADMIN"].includes(r)) && (
                <>
                  <SidebarLink
                    href="/admin/settings"
                    label="Настройки клуба"
                    icon={<Settings size={20} />}
                  />
                  <SidebarLink
                    href="/admin/audit"
                    label="Журнал действий"
                    icon={<History size={20} />}
                  />
                  <SidebarLink
                    href="/admin/deliveries"
                    label="Доставка писем"
                    icon={<Mail size={20} />}
                  />
                </>
              )}
            {(area === "account" ||
              user.roles.some((r) =>
                ["OWNER", "ADMIN", "TRAINER"].includes(r),
              )) && (
              <SidebarLink
                href={root + "/programs"}
                label={area === "account" ? "Мои программы" : "Программы"}
                icon={<Dumbbell size={20} />}
              />
            )}
            {area !== "account" &&
              user.roles.some((r) =>
                ["OWNER", "ADMIN", "TRAINER"].includes(r),
              ) && (
                <>
                  <SidebarLink
                    href={root + "/exercises"}
                    label="Упражнения"
                    icon={<Activity size={20} />}
                  />
                  <SidebarLink
                    href={root + "/assignments"}
                    label="Назначения программ"
                    icon={<Users size={20} />}
                  />
                </>
              )}
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
                  href="/account/bookings"
                  label="Мои записи"
                  icon={<CalendarDays size={20} />}
                />
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
                  href="/trainer/bookings"
                  label="Участники"
                  icon={<Users size={20} />}
                />
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
            {area === "admin" &&
              user.roles.some((r) => ["OWNER", "ADMIN"].includes(r)) && (
                <SidebarLink
                  href="/admin/users"
                  label="Пользователи"
                  icon={<ShieldCheck size={20} />}
                />
              )}
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
            <select
              className="workspace-switch"
              aria-label="Рабочее пространство"
              value={area}
              onChange={(e) => router.push("/" + e.target.value)}
            >
              {user.roles.some((r) =>
                ["OWNER", "ADMIN", "RECEPTION"].includes(r),
              ) && <option value="admin">Управление клубом</option>}
              {user.roles.includes("TRAINER") && (
                <option value="trainer">Кабинет тренера</option>
              )}
              {user.roles.includes("CLIENT") && (
                <option value="account">Личный кабинет</option>
              )}
            </select>
            <div className="user-chip">
              <NotificationBell area={area} />
              <span>{user.name}</span>
              <Link
                href={root + "/profile"}
                aria-label="Мой профиль"
                className="avatar"
              >
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                  />
                ) : (
                  user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                )}
              </Link>
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
            {area === "account" && !user.client?.phone && (
              <div className="notice">
                Добавьте контактный телефон для покупки абонементов и записи.{" "}
                <Link href="/account/profile">Открыть профиль</Link>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </Sidebar>
  );
}
