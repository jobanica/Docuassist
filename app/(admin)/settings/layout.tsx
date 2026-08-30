import Link from "next/link";
import {
  Tag,
  MessageSquare,
  Building2,
  Link2,
  Users,
  Wand2,
  Tags,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { getStaff } from "@/lib/auth";
import { SETTINGS_TABS } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  Tag,
  MessageSquare,
  Building2,
  Link2,
  Users,
  Wand2,
  Tags,
};

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same lookup the admin layout already did this request (React cache), so
  // hiding the tab costs nothing. The page itself re-checks the role.
  const staff = await getStaff();
  const visible = SETTINGS_TABS.filter(
    (t) => !t.adminOnly || staff?.role === "admin"
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      {/* On desktop these live in the sidebar under Settings; the strip is
          only for mobile, where there is no sidebar to hang them off. */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-[0_1px_3px_rgba(16,24,40,0.06)] md:hidden">
        {visible.map(({ href, label, icon }) => {
          const Icon = ICONS[icon] ?? Settings;
          return (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
