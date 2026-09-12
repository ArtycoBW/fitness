'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';
export function Providers({children}:{children:React.ReactNode}) {
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:(count,error)=>!(error instanceof ApiError&&[401,403,404].includes(error.status))&&count<1},mutations:{retry:false}}}));
 return <QueryClientProvider client={client}><TooltipProvider>{children}<Toaster position="bottom-right" richColors/></TooltipProvider></QueryClientProvider>;
}
