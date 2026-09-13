import { SchedulePage } from "@/features/schedule/schedule-page";
import { PublicHeader } from "@/components/layout/public-header";
export default function Page() {
  return (
    <>
      <PublicHeader />
      <main className="public-content">
        <SchedulePage area="public" />
      </main>
    </>
  );
}
