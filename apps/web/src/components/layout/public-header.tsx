import Link from 'next/link';
export function PublicHeader(){return <header className="public-header"><Link href="/" className="brand">страйд<span>клуб движения</span></Link><nav><Link href="/schedule">Расписание</Link><Link href="/memberships">Абонементы</Link><Link href="/login" className="public-login">Войти</Link></nav></header>;}
