import { CatalogDetail } from "@/features/catalog/catalog-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail kind="workouts" id={id} />;
}
