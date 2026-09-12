'use client';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays,MoveUpRight } from 'lucide-react';
import { api,type User } from '@/lib/api';
export function Overview(){const {data:user}=useQuery({queryKey:['me'],queryFn:()=>api<User>('/auth/me')});return <><div className="page-heading"><span className="eyebrow">ВАШ РИТМ</span><h1>Здравствуйте, {user?.name.split(' ')[0]}.</h1><p>Хороший день начинается с движения.</p></div><section className="welcome-panel"><div><CalendarDays size={30} strokeWidth={1.3}/><h2>Здесь начинается<br/>ваша следующая тренировка.</h2><p>Ваше расписание, абонементы и программы собраны в одном пространстве.</p></div><MoveUpRight size={70} strokeWidth={.7}/></section><div className="surface empty-state"><span className="empty-icon"><CalendarDays/></span><h2>Пока нет запланированных занятий</h2><p>Новые записи появятся здесь и останутся под рукой.</p></div></>;}
