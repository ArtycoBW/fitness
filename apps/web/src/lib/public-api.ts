import "server-only";
export async function publicApi<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(
      (process.env.API_URL ?? "http://localhost:4000") +
        "/api/v1/public/" +
        path,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
export const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
