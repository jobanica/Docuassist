import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { getStaff } from "@/lib/auth";

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
  // Cached per request — the page below reuses this same lookup.
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const items = nav.filter((i) => !i.adminOnly || staff.role === "admin");

  return (
    <div className="flex min-h-screen bg-[#eef1f6]">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[#1e3a5f] text-white md:flex">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-4 ring-white/15">
            <User className="h-10 w-10 text-white/90" />
          </div>
          <p className="mt-4 text-lg font-semibold uppercase tracking-wide">
            {staff.name}
          </p>
          <p className="mt-0.5 text-xs text-white/60">{staff.email ?? ""}</p>
          <span className="mt-2 rounded-full bg-[#eda100]/20 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[#f5c04e]">
            {staff.role}
          </span>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-4">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 rounded-lg px-4 py-3 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-4 pb-6">
          <form action="/auth/sign-out" method="post">
            <button className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white">
              <LogOut className="h-[18px] w-[18px]" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between bg-[#1e3a5f] px-4 py-3 text-white md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
              <User className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">{staff.name}</span>
          </div>
          <form action="/auth/sign-out" method="post">
            <button className="rounded-md p-2 hover:bg-white/10">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </header>

        {/* Mobile nav strip */}
        <nav className="flex gap-1 overflow-x-auto bg-[#17304f] px-2 py-2 md:hidden">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs text-white/75 hover:bg-white/10"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
