import type { MetadataRoute } from "next";
import { publicApi, siteUrl } from "@/lib/public-api";
import type { PublicItem } from "@/features/landing/types";
export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const kinds = ["workouts", "halls", "trainers"],
    lists = await Promise.all(kinds.map((k) => publicApi<PublicItem[]>(k)));
  return [
    "",
    "/workouts",
    "/halls",
    "/trainers",
    "/schedule",
    "/memberships",
    "/privacy",
    "/terms",
    ...lists.flatMap((l, i) =>
      (l ?? []).map((item) => `/${kinds[i]}/${encodeURIComponent(item.slug)}`),
    ),
  ].map((path) => ({
    url: siteUrl + path,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}
