import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "./footer";
import { publicApi } from "@/lib/public-api";
import type { PublicItem } from "./types";
import "@/app/landing.css";
export type CatalogKind = "workouts" | "halls" | "trainers";
export const catalogTitles = {
  workouts: "Направления",
  halls: "Пространства клуба",
  trainers: "Тренеры",
};
const subtitles = {
  workouts: "Выберите движение, которое подходит вам сегодня.",
  halls: "У каждого занятия — своё пространство.",
  trainers: "Люди, которые помогут найти ваш темп.",
};
export async function Catalog({
  kind,
  slug,
}: {
  kind: CatalogKind;
  slug?: string;
}) {
  const items = await publicApi<PublicItem[]>(
    kind + (slug ? "/" + encodeURIComponent(slug) : ""),
  );
  if (items && slug && !items.length) notFound();
  const item = slug ? items?.[0] : null;
  return (
    <div className="landing">
      <PublicHeader />
      <main id="main-content" className="public-catalog">
        {slug && (
          <Link className="back-link" href={"/" + kind}>
            ← {catalogTitles[kind]}
          </Link>
        )}
        <span className="eyebrow">
          СТРАЙД / {catalogTitles[kind].toUpperCase()}
        </span>
        <h1>{item?.name ?? catalogTitles[kind]}</h1>
        {!slug && <p>{subtitles[kind]}</p>}
        {!items ? (
          <p role="alert">
            Каталог временно недоступен.{" "}
            <a
              className="table-link"
              href={"/" + kind + (slug ? "/" + slug : "")}
            >
              Обновить страницу
            </a>
          </p>
        ) : item ? (
          <>
            <div className="public-detail-grid">
              <div>
                {item.imageUrl || item.avatarUrl ? (
                  <img
                    src={(item.imageUrl || item.avatarUrl)!}
                    alt={item.name}
                  />
                ) : (
                  <div className="public-detail-art" aria-hidden="true">
                    {item.name
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")}
                  </div>
                )}
              </div>
              <div>
                <p>{item.description ?? item.bio}</p>
                <dl>
                  {item.durationMinutes && (
                    <div>
                      <dt>Продолжительность</dt>
                      <dd>{item.durationMinutes} минут</dd>
                    </div>
                  )}
                  {item.capacity && (
                    <div>
                      <dt>Вместимость</dt>
                      <dd>До {item.capacity} человек</dd>
                    </div>
                  )}
                  {!!item.specialties?.length && (
                    <div>
                      <dt>Направления</dt>
                      <dd>{item.specialties.join(" · ")}</dd>
                    </div>
                  )}
                  {!!item.equipment?.length && (
                    <div>
                      <dt>Оборудование</dt>
                      <dd>{item.equipment.join(", ")}</dd>
                    </div>
                  )}
                </dl>
                <Link
                  className="landing-button mt-6"
                  href={
                    "/schedule?" +
                    {
                      workouts: "workoutId",
                      halls: "hallId",
                      trainers: "trainerId",
                    }[kind] +
                    "=" +
                    item.id
                  }
                >
                  Выбрать тренировку{" "}
                </Link>
              </div>
            </div>
            <section className="surface">
              <h2 style={{ fontSize: 36 }}>С чего начать</h2>
              <p className="my-5">
                В расписании указаны свободные места и условия записи. Если
                нужна помощь с выбором, оставьте обращение — мы свяжемся с вами.
              </p>
              <Link className="table-link" href="/#contact">
                Познакомиться с клубом{" "}
              </Link>
            </section>
          </>
        ) : (
          <div className="catalog-public-grid">
            {items.map((i, n) => (
              <article className="catalog-public-card" key={i.id}>
                <span className="eyebrow">
                  {String(n + 1).padStart(2, "0")}
                </span>
                {(i.imageUrl || i.avatarUrl) && (
                  <img
                    src={(i.imageUrl || i.avatarUrl)!}
                    alt={i.name}
                    loading="lazy"
                  />
                )}
                <h2>
                  <Link href={`/${kind}/${i.slug}`}>{i.name}</Link>
                </h2>
                <p>{i.description ?? i.bio}</p>
                <Link className="text-arrow" href={`/${kind}/${i.slug}`}>
                  Подробнее <span> </span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
