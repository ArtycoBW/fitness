import { ConfirmationPage } from "@/features/payments/checkout";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ConfirmationPage id={(await params).id} />;
}
