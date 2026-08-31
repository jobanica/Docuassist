"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  Tag,
  MessageSquare,
  Building2,
  Link2,
  Wand2,
  Tags,
  PackageX,
  type LucideIcon,
} from "lucide-react";
import { MAIN_NAV, SETTINGS_TABS, SUPPLIER_NAV } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  Tag,
  MessageSquare,
  Building2,
  Link2,
  Wand2,
  Tags,
  PackageX,
};

/**
 * The sidebar nav.
 *
 * Settings pages hang off the Settings entry rather than sitting in a strip
 * across the top of the page: there are seven of them now and the strip had
 * started to run off the edge. They stay listed while you are inside Settings,
 * so moving between them is one click from wherever the sidebar already is.
 */
export function SideNav({ role }: { role: string }) {
  const pathname = usePathname() ?? "";
  const inSettings = pathname.startsWith("/settings");
  const isSupplier = role === "supplier";
  const main = isSupplier
    ? SUPPLIER_NAV
    : MAIN_NAV.filter((i) => !i.adminOnly || role === "admin");
  const tabs = isSupplier
    ? []
    : SETTINGS_TABS.filter((i) => !i.adminOnly || role === "admin");

  return (
    <nav className="mt-2 flex-1 space-y-1 px-4">
      {main.map((item) => {
        const Icon = ICONS[item.icon] ?? Settings;
        const isSettings = item.label === "Settings";
        const active = isSettings
          ? inSettings
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <div key={item.label}>
            <Link
              href={item.href}
              className={`flex items-center gap-4 rounded-lg px-4 py-3 text-sm transition-colors ${
                active
                  ? "bg-white/15 font-medium text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>

            {isSettings && inSettings && (
              <ul className="mb-1 mt-1 space-y-0.5 border-l border-white/15 pl-4 ml-6">
                {tabs.map((t) => {
                  const TabIcon = ICONS[t.icon] ?? Settings;
                  const on = pathname === t.href;
                  return (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                          on
                            ? "bg-white/15 font-medium text-white"
                            : "text-white/65 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <TabIcon className="h-3.5 w-3.5 shrink-0" />
                        {t.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
