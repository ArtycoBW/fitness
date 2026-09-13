import { ProgramEditor } from "@/features/programs/program-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProgramEditor id={id} area="trainer" />;
}
