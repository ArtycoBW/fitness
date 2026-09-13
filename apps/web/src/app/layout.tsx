import type { Metadata } from "next";
import { Manrope, Cormorant_Garamond } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./programs.css";
import "./dashboard.css";
import "./operations.css";
const sans = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});
const display = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400"],
  variable: "--font-cormorant",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Страйд | Фитнес-клуб",
  description: "Тренировки, расписание и личный кабинет фитнес-клуба",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={sans.variable + " " + display.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
