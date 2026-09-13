import { Catalog, catalogTitles } from "@/features/landing/catalog";
export const dynamic = "force-dynamic";
export const metadata = {
  title: catalogTitles.trainers + " | Страйд",
  alternates: { canonical: "/trainers" },
};
export default function Page() {
  return <Catalog kind="trainers" />;
}
