import Link from "next/link";
import { Tag, MessageSquare, Building2, Link2, Users, Wand2 } from "lucide-react";
import { getStaff } from "@/lib/auth";

const tabs = [
  { href: "/settings/services", label: "Services & prices", icon: Tag },
  { href: "/settings/notifications", label: "SMS notifications", icon: MessageSquare },
  { href: "/settings/business", label: "Business info", icon: Building2 },
  { href: "/settings/public-form", label: "Online order form", icon: Link2 },
  { href: "/settings/parsing", label: "Auto-fill", icon: Wand2 },
  { href: "/settings/staff", label: "Staff accounts", icon: Users, adminOnly: true },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same lookup the admin layout already did this request (React cache), so
  // hiding the tab costs nothing. The page itself re-checks the role.
  const staff = await getStaff();
  const visible = tabs.filter((t) => !t.adminOnly || staff?.role === "admin");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        {visible.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
