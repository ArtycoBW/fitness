import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Страйд | Фитнес-клуб', description: 'Тренировки, расписание и личный кабинет фитнес-клуба' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="ru"><body>{children}</body></html>; }
