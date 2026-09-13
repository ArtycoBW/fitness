import {PaymentDetail} from '@/features/payments/payment-pages';
export default async function Page({params}:{params:Promise<{id:string}>}){return <PaymentDetail area="admin" id={(await params).id}/>;}
