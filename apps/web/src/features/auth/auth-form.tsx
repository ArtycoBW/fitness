'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api,post,workspace,type User } from '@/lib/api';
const schema=z.object({email:z.email('Укажите корректный email').optional(),password:z.string().min(12,'Не менее 12 символов').max(128).optional(),name:z.string().min(2,'Укажите имя').max(100).optional(),consent:z.boolean().optional()});
type Values=z.infer<typeof schema>;
type Mode='login'|'register'|'forgot-password'|'reset-password'|'verify-email'|'accept-invite';
const labels:Record<Mode,{title:string,description:string,button:string}>= {
 login:{title:'С возвращением',description:'Ваши тренировки, абонементы и планы на одном месте.',button:'Войти'},
 register:{title:'Начните свой ритм',description:'Создайте аккаунт, чтобы выбирать занятия и следить за прогрессом.',button:'Создать аккаунт'},
 'forgot-password':{title:'Восстановить доступ',description:'Отправим на вашу почту ссылку для нового пароля.',button:'Отправить ссылку'},
 'reset-password':{title:'Новый пароль',description:'Выберите надёжный пароль от 12 символов.',button:'Сохранить пароль'},
 'verify-email':{title:'Подтвердите адрес',description:'Один шаг до вашего личного кабинета.',button:'Подтвердить email'},
 'accept-invite':{title:'Добро пожаловать в команду',description:'Придумайте пароль для рабочего аккаунта.',button:'Принять приглашение'},
};
export function AuthForm({mode}:{mode:Mode}){
 const router=useRouter(),params=useSearchParams(),qc=useQueryClient();const [error,setError]=useState(''),[success,setSuccess]=useState('');
 const form=useForm<Values>({resolver:zodResolver(schema)});const spec=labels[mode];
 const submit=async(values:Values)=>{setError('');try{
  if(mode==='register'&&!values.consent){setError('Подтвердите согласие с условиями');return;}
  const body=mode==='verify-email'?{token:params.get('token')}:mode==='reset-password'||mode==='accept-invite'?{token:params.get('token'),password:values.password}:values;
  const result=await post<{message:string}>('/auth/'+mode,body);
  if(mode==='login') {qc.clear();const user=await api<User>('/auth/me');qc.setQueryData(['me'],user);const target=params.get('next');router.replace(target&&target.startsWith('/')&&!target.startsWith('//')&&!target.includes('\\')?target:workspace(user));}
  else setSuccess(result.message);
 }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить действие');}};
 return <div className="auth-page"><aside className="auth-art"><Link className="brand" href="/">страйд<span>клуб движения</span></Link><div><span className="eyebrow">МЕСТО ДЛЯ ВАШЕГО РИТМА</span><h2>Сильнее.<br/>Спокойнее.<br/><i>Ближе к себе.</i></h2></div><div className="auth-art-foot"><span>Движение, которое остаётся с вами.</span><ArrowUpRight size={24}/></div></aside><section className="auth-form-wrap"><Link href="/" className="auth-back">Вернуться на сайт <ArrowUpRight size={15}/></Link><div className="auth-form"><span className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span><h1>{spec.title}</h1><p className="muted">{spec.description}</p>{success?<div className="success-box" role="status"><Check/><p>{success}</p><Button asChild><Link href="/login">Перейти ко входу</Link></Button></div>:<form onSubmit={form.handleSubmit(submit)} className="form-stack">{mode==='register'&&<div className="field"><Label htmlFor="name">Ваше имя</Label><Input id="name" autoComplete="name" {...form.register('name')}/>{form.formState.errors.name&&<p className="field-error">{form.formState.errors.name.message}</p>}</div>}{['login','register','forgot-password'].includes(mode)&&<div className="field"><Label htmlFor="email">Электронная почта</Label><Input id="email" type="email" autoComplete="email" placeholder="you@example.ru" required {...form.register('email')}/>{form.formState.errors.email&&<p className="field-error">{form.formState.errors.email.message}</p>}</div>}{['login','register','reset-password','accept-invite'].includes(mode)&&<div className="field"><div className="flex items-center justify-between"><Label htmlFor="password">Пароль</Label>{mode==='login'&&<Link className="text-sm" href="/forgot-password">Забыли пароль?</Link>}</div><Input id="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required {...form.register('password')}/>{mode!=='login'&&<p className="field-hint">Не менее 12 символов</p>}{form.formState.errors.password&&<p className="field-error">{form.formState.errors.password.message}</p>}</div>}{mode==='register'&&<label className="consent"><input type="checkbox" {...form.register('consent')}/><span>Принимаю <Link href="/terms">условия клуба</Link> и <Link href="/privacy">политику конфиденциальности</Link></span></label>}{error&&<div className="form-error" role="alert">{error}</div>}<Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting?'Подождите…':spec.button}<ArrowRight size={18}/></Button></form>}{mode==='login'&&<p className="auth-switch">Ещё нет аккаунта? <Link href="/register">Зарегистрироваться</Link></p>}{mode==='register'&&<p className="auth-switch">Уже с нами? <Link href="/login">Войти</Link></p>}</div><span className="auth-footer">СТРАЙД · КЛУБ ДВИЖЕНИЯ</span></section></div>;
}
