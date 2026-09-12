import { Suspense } from 'react';
import { AuthForm } from '@/features/auth/auth-form';
export default function Page(){return <Suspense fallback={<div className="app-loading">Открываем страницу…</div>}><AuthForm mode="reset-password"/></Suspense>;}
