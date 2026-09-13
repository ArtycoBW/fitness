import "server-only";
import { workoutPhoto, trainerPhoto } from "@/features/landing/media";
export async function publicApi<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(
      (process.env.API_URL ?? "http://localhost:4000") +
        "/api/v1/public/" +
        path,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) return null;
    const data = await r.json();
    const enrich = (item: Record<string, unknown>) =>
      path.startsWith("workouts")
        ? {
            ...item,
            imageUrl: item.imageUrl || workoutPhoto(String(item.name)),
          }
        : path.startsWith("trainers")
          ? {
              ...item,
              avatarUrl: item.avatarUrl || trainerPhoto(String(item.name)),
            }
          : item;
    return (
      Array.isArray(data)
        ? data.map(enrich)
        : data && typeof data === "object"
          ? enrich(data)
          : data
    ) as T;
  } catch {
    return null;
  }
}
export const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
