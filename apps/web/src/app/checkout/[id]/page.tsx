import { Checkout } from "@/features/payments/checkout";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Checkout id={(await params).id} />;
}
