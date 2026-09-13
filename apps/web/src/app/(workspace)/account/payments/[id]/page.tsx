import { PaymentDetail } from "@/features/payments/payment-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PaymentDetail area="account" id={(await params).id} />;
}
