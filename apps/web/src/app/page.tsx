import { AccountFilm } from "@/features/landing/account-film";
import { LandingFaq } from "@/features/landing/faq";
import { LandingShell } from "@/features/landing/landing-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { publicApi } from "@/lib/public-api";
import type { PublicItem, Club } from "@/features/landing/types";
import type { Plan } from "@/features/memberships/plans";
import { PublicHeader } from "@/components/layout/public-header";
import { Hero } from "@/features/landing/hero";
import { Colonnade } from "@/features/landing/colonnade";
import { Almanac } from "@/features/landing/almanac";
import { Halls } from "@/features/landing/halls";
import { ContactForm } from "@/features/landing/contact";
import { LandingMotion } from "@/features/landing/motion";
import { NextSessions } from "@/features/landing/next-sessions";
import { PublicFooter } from "@/features/landing/footer";
import { money, visits } from "@/lib/format";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Страйд — движение в вашем ритме",
  description:
    "Фитнес-клуб Страйд: силовые тренировки, йога, пилатес и персональные программы. Найдите свой ритм, выберите абонемент и запишитесь на занятие.",
  alternates: { canonical: "/" },
};
export default async function Home() {
  const [workouts, halls, trainers, plans, club] = await Promise.all([
    publicApi<PublicItem[]>("workouts"),
    publicApi<PublicItem[]>("halls"),
    publicApi<PublicItem[]>("trainers"),
    publicApi<Plan[]>("membership-plans"),
    publicApi<Club>("club"),
  ]);
  const faq = [
    [
      "Я давно не тренировался. С чего начать?",
      "Выберите комфортное направление или оставьте обращение. Администратор поможет найти занятие, а тренер — подобрать нагрузку под ваш опыт. На первой тренировке расскажите тренеру о своих ограничениях.",
    ],
    [
      "Как записаться на занятие?",
      "Создайте аккаунт, выберите абонемент. В расписании откройте занятие и подтвердите запись. В личном кабинете будут время, зал и имя тренера.",
    ],
    [
      "Можно отменить запись?",
      club
        ? `Да. Для новых занятий бесплатная отмена доступна не позднее чем за ${club.bookingPolicy.cancelMinutes} минут до начала. Условия конкретной записи всегда указаны в её карточке; они сохраняются даже при изменении правил клуба.`
        : "Да. Срок бесплатной отмены и условия поздней отмены указаны в карточке занятия перед подтверждением записи.",
    ],
    [
      "Что делать, если все места заняты?",
      "Встаньте в очередь в карточке занятия. При появлении места система проверит абонемент и ограничения записи. Подтверждение появится в уведомлениях; до этого очередь не является записью на тренировку.",
    ],
    [
      "Есть ли заморозка абонемента?",
      "Условия зависят от тарифа. Количество дней и доступные даты видны до покупки и в вашем абонементе. Если в выбранные даты есть записи, сначала отмените их.",
    ],
  ];
  return (
    <LandingShell>
      <PublicHeader />
      <main id="main-content" className="landing-main">
        <Hero
          workoutCount={workouts?.length ?? 0}
          hallCount={halls?.length ?? 0}
        />
        <LandingMotion />
        <section id="club" className="landing-section club-intro">
          <div data-reveal>
            <span className="eyebrow">01 / ЗНАКОМСТВО</span>
            <h2>
              Не только тренировки.
              <br />
              <em>Время для себя.</em>
            </h2>
          </div>
          <div data-reveal>
            <p className="large-lead">
              Мы верим в движение, которое остаётся с вами.
            </p>
            <p>
              Внимательный тренер, понятный план и пространство, в которое
              хочется возвращаться. От первого занятия до привычки, которая
              делает каждый день лучше.
            </p>
            <Link href="#directions" className="text-arrow">
              Найти своё направление <span>↗</span>
            </Link>
          </div>
        </section>
        <section id="directions" className="directions-section">
          <div className="section-heading landing-section" data-reveal>
            <div>
              <span className="eyebrow">02 / ВЫБЕРИТЕ СВОЙ ТЕМП</span>
              <h2>
                Разные движения.
                <br />
                <em>Один — ваш.</em>
              </h2>
            </div>
            <p>
              Сила, баланс, подвижность. Пробуйте то, что откликается вам
              сегодня.
            </p>
          </div>
          {workouts?.length ? (
            <Colonnade items={workouts} />
          ) : (
            <div className="landing-section">
              <p>Каталог временно недоступен.</p>
              <Link href="/workouts">Открыть направления →</Link>
            </div>
          )}
        </section>
        <section id="spaces" className="landing-section">
          <div className="section-heading" data-reveal>
            <div>
              <span className="eyebrow">03 / ПРОСТРАНСТВО КЛУБА</span>
              <h2>
                Место, где
                <br />
                <em>легче начать.</em>
              </h2>
            </div>
            <p>
              Зал для каждой задачи. Познакомьтесь с пространствами и найдите
              своё занятие.
            </p>
          </div>
          <Halls items={halls ?? []} />
        </section>
        <section id="timetable" className="schedule-band">
          <div className="landing-section">
            <div className="section-heading" data-reveal>
              <div>
                <span className="eyebrow">04 / БЛИЖАЙШИЕ ЗАНЯТИЯ</span>
                <h2>
                  Время
                  <br />
                  <em>для движения.</em>
                </h2>
              </div>
              <Link href="/schedule" className="landing-button outline">
                Всё расписание ↗
              </Link>
            </div>
            <NextSessions />
          </div>
        </section>
        <section id="team" className="team-section">
          <Almanac items={trainers ?? []} />
        </section>
        <section id="plans" className="landing-section">
          <div className="section-heading" data-reveal>
            <div>
              <span className="eyebrow">06 / АБОНЕМЕНТЫ</span>
              <h2>
                На один шаг.
                <br />
                <em>И на новый ритм.</em>
              </h2>
            </div>
            <p>
              Выберите, сколько времени хотите подарить себе. Все условия — до
              покупки.
            </p>
          </div>
          <div className="landing-plans">
            {plans?.map((p, i) => {
              const v = p.versions[0];
              if (!v) return null;
              return (
                <article className="landing-plan" key={p.id} data-reveal>
                  <span className="eyebrow">
                    {String(i + 1).padStart(2, "0")} / ВАШ ВЫБОР
                  </span>
                  <h3>{p.name}</h3>
                  <p>{v.description}</p>
                  <div className="plan-amount">
                    {money(v.priceMinor)}
                    <span>{v.durationDays} дней</span>
                  </div>
                  <ul>
                    <li>
                      {v.visitLimit === null
                        ? "Без ограничения посещений"
                        : visits(v.visitLimit)}
                    </li>
                    <li>
                      {v.freezeQuotaDays
                        ? `Заморозка до ${v.freezeQuotaDays} дней`
                        : "Без заморозки"}
                    </li>
                  </ul>
                  <Link href="/memberships" className="landing-button outline">
                    Выбрать абонемент ↗
                  </Link>
                </article>
              );
            })}
          </div>
          {!plans && (
            <p>
              Тарифы временно недоступны.{" "}
              <Link href="/memberships">Попробовать снова →</Link>
            </p>
          )}
        </section>
        <section id="your-club" className="account-preview landing-section">
          <div data-reveal>
            <span className="eyebrow">ВСЁ НЕОБХОДИМОЕ — РЯДОМ</span>
            <h2>
              Ваш клуб.
              <br />
              <em>В вашем кармане.</em>
            </h2>
            <p>
              Записывайтесь на тренировки, следите за абонементом и отмечайте
              прогресс в программе. В удобное вам время.
            </p>
            <Link href="/register" className="landing-button">
              Создать аккаунт ↗
            </Link>
          </div>
          <div className="account-preview-image" data-reveal>
            <AccountFilm />
          </div>
        </section>
        <section id="faq" className="landing-section faq-section">
          <div data-reveal>
            <span className="eyebrow">ВОПРОСЫ ПЕРЕД СТАРТОМ</span>
            <h2>
              Давайте
              <br />
              <em>разберёмся.</em>
            </h2>
          </div>
          <LandingFaq items={faq} />
        </section>
        <section id="contact" className="contact-section">
          <div className="landing-section contact-grid">
            <div data-reveal>
              <span className="eyebrow">ПЕРВЫЙ ШАГ — ЗНАКОМСТВО</span>
              <h2>
                Начнём
                <br />
                <em>с вас.</em>
              </h2>
              <p>
                Расскажите, что вам интересно. Поможем выбрать тренировку и
                ответим на вопросы.
              </p>
              <dl className="club-contacts">
                {club?.hours && (
                  <div>
                    <dt>Ждём вас</dt>
                    <dd>{club.hours}</dd>
                  </div>
                )}
                {club?.address && (
                  <div>
                    <dt>Адрес</dt>
                    <dd>{club.address}</dd>
                  </div>
                )}
                {club?.phone && (
                  <div>
                    <dt>Позвоните нам</dt>
                    <dd>
                      <a href={"tel:" + club.phone.replace(/[^+\d]/g, "")}>
                        {club.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
      <PublicFooter />
    </LandingShell>
  );
}
