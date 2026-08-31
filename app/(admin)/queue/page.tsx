import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { supplierQueue } from "@/lib/actions/supplier";
import { SupplierQueue } from "@/components/admin/SupplierQueue";

export const dynamic = "force-dynamic";

/**
 * The supplier's only screen.
 *
 * Staff and admins are sent to the orders board instead — this page exists so
 * a supplier has somewhere to land that carries no prices and no pipeline, not
 * as an alternative view of the same work.
 */
export default async function QueuePage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.role !== "supplier") redirect("/orders");

  const rows = await supplierQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Documents to process
        </h1>
        <p className="text-sm text-slate-500">
          TIN and PhilHealth applications waiting on you. Mark one as started
          when you begin it; it stays on the list until the finished IDs are
          received.
        </p>
      </div>
      <SupplierQueue rows={rows} />
    </div>
  );
}
