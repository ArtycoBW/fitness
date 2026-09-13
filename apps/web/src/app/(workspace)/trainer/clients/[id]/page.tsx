import { TrainerClient } from "@/features/dashboard/trainer-client";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TrainerClient id={id} />;
}
