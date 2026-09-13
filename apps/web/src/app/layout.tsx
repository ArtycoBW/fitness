import type { Metadata } from "next";
import { Manrope, Cormorant_Garamond } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./programs.css";
import "./dashboard.css";
import "./operations.css";
import "./refinements.css";
import "./landing-refinements.css";
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
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Страйд | Фитнес-клуб",
  description: "Тренировки, расписание и личный кабинет фитнес-клуба",
  openGraph: {
    title: "Страйд — движение в вашем ритме",
    description: "Фитнес-клуб, расписание и персональные программы занятий",
    locale: "ru_RU",
    type: "website",
    images: ["/opengraph-image"],
  },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={sans.variable + " " + display.variable}>
        <noscript>
          <style>{`.almanac-body,.almanac-foot{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
