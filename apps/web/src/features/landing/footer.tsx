import Link from "next/link";
export function PublicFooter() {
  return (
    <footer className="landing-footer">
      <div className="footer-links">
        <div>
          <Link href="/" className="brand">
            страйд
          </Link>
          <p>Движение в вашем ритме.</p>
        </div>
        <nav aria-label="О клубе">
          <span>КЛУБ</span>
          <Link href="/workouts">Направления</Link>
          <Link href="/trainers">Тренеры</Link>
          <Link href="/halls">Пространства</Link>
        </nav>
        <nav aria-label="Занятия">
          <span>ВАШ РИТМ</span>
          <Link href="/schedule">Расписание</Link>
          <Link href="/memberships">Абонементы</Link>
          <Link href="/login">Личный кабинет</Link>
        </nav>
        <div>
          <span>ПЕРВЫЙ ШАГ</span>
          <Link href="/#contact">Познакомиться с клубом ↗</Link>
        </div>
      </div>
      <div className="footer-wordmark" aria-hidden="true">
        страйд.
      </div>
      <div className="footer-meta">
        <span>© {new Date().getFullYear()} Страйд</span>
        <Link href="/privacy">Конфиденциальность</Link>
        <Link href="/terms">Условия клуба</Link>
      </div>
    </footer>
  );
}
