import { requireSession } from "@/lib/auth/session";
import { NewAuditClient } from "@/components/alignment-audit/NewAuditClient";

export default async function AlignmentAuditNewPage() {
  await requireSession();
  return <NewAuditClient />;
}
