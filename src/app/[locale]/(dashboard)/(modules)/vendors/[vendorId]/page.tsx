import { requireSession } from "@/lib/auth/session";
import { VendorDetailClient } from "@/components/vendor/VendorDetailClient";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { role } = await requireSession();
  const { vendorId } = await params;
  return <VendorDetailClient vendorId={vendorId} role={role} />;
}
