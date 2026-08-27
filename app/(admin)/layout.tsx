import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

// adminOnly entries are hidden from staff. Hiding is cosmetic — the real
// enforcement is the role check in each page plus the DB-level guards.
const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/orders", label: "Orders", icon: Package, adminOnly: false },
  { href: "/customers", label: "Customers", icon: Users, adminOnly: false },
  { href: "/settings/notifications", label: "Settings", icon: Settings, adminOnly: false },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: staff } = await supabase
    .from("staff_users")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff) redirect("/login");

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="px-5 py-4">
          <p className="text-lg font-semibold">DocuAssist PH</p>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav
            .filter((item) => !item.adminOnly || staff.role === "admin")
            .map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <p className="px-2 pb-2 text-xs text-muted-foreground">
            {staff.name} · {staff.role}
          </p>
          <form action="/auth/sign-out" method="post">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <span className="font-semibold">DocuAssist PH</span>
          <form action="/auth/sign-out" method="post">
            <Button variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
