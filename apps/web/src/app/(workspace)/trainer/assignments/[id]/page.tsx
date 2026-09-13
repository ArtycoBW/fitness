import { AssignmentDetail } from "@/features/programs/assignments";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssignmentDetail id={id} area="trainer" />;
}
