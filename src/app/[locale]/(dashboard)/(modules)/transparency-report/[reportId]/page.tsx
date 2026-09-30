import { requireSession } from "@/lib/auth/session";
import { TxrDetailClient } from "@/components/transparency-report/DetailClient";

export default async function TxrDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  await requireSession();
  const { reportId } = await params;
  return <TxrDetailClient id={reportId} />;
}
