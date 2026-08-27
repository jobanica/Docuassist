import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";

export default async function Home() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  // Staff have no sales dashboard — send them straight to the orders board.
  redirect(staff.role === "admin" ? "/dashboard" : "/orders");
}
