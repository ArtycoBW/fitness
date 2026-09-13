import { Catalog, catalogTitles } from "@/features/landing/catalog";
import { publicApi } from "@/lib/public-api";
import type { PublicItem } from "@/features/landing/types";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = await publicApi<PublicItem[]>(
    "trainers/" + encodeURIComponent(slug),
  );
  const item = list?.[0];
  return {
    title: (item?.name ?? catalogTitles.trainers) + " | Страйд",
    description: item?.description ?? item?.bio,
    alternates: { canonical: "/trainers/" + encodeURIComponent(slug) },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <Catalog kind="trainers" slug={(await params).slug} />;
}
