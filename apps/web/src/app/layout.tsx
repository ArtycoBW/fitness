import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { SiteIntro } from "@/components/site-intro";
import "./globals.css";
import "./programs.css";
import "./dashboard.css";
import "./operations.css";
import "./refinements.css";
import "./landing.css";
import "./landing-refinements.css";
import "./experience.css";
import "./star-hero.css";
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
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname==='/'&&!localStorage.getItem('stride-intro-seen')){document.documentElement.dataset.intro='pending';window.__strideIntroStart=performance.now();setTimeout(function(){delete document.documentElement.dataset.intro;var app=document.getElementById('site-content');if(app)app.inert=false},4500)}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <noscript>
          <style>{`.almanac-body,.almanac-foot{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <Providers>
          <div id="site-content">{children}</div>
          <SiteIntro />
        </Providers>
      </body>
    </html>
  );
}
