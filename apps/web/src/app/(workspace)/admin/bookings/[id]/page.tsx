import { BookingDetail } from "@/features/bookings/booking-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <BookingDetail area="admin" id={(await params).id} />;
}
