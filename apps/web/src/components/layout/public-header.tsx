"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, workspace, type User } from "@/lib/api";
export function PublicHeader() {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });
  return (
    <header className="public-header">
      <Link href="/" className="brand">
        страйд<span>клуб движения</span>
      </Link>
      <nav>
        <Link href="/schedule">Расписание</Link>
        <Link href="/memberships">Абонементы</Link>
        <Link href={user ? workspace(user) : "/login"} className="public-login">
          {user ? "Кабинет" : "Войти"}
        </Link>
      </nav>
    </header>
  );
}
