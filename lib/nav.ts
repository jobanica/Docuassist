/**
 * Admin navigation, in one place so the sidebar and the mobile strip can never
 * drift apart. Icons are named rather than imported here, because this module
 * is pulled into both server and client components.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Hidden from staff accounts. Cosmetic — the pages re-check the role. */
  adminOnly?: boolean;
}

export const SETTINGS_TABS: NavItem[] = [
  { href: "/settings/services", label: "Services & prices", icon: "Tag" },
  { href: "/settings/notifications", label: "SMS notifications", icon: "MessageSquare" },
  { href: "/settings/business", label: "Business info", icon: "Building2" },
  { href: "/settings/public-form", label: "Online order form", icon: "Link2" },
  { href: "/settings/parsing", label: "Auto-fill", icon: "Wand2" },
  { href: "/settings/tags", label: "Tags", icon: "Tags" },
  { href: "/settings/staff", label: "Staff accounts", icon: "Users", adminOnly: true },
];

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", adminOnly: true },
  { href: "/orders", label: "Orders", icon: "Package" },
  { href: "/customers", label: "Customers", icon: "Users" },
  { href: "/settings/services", label: "Settings", icon: "Settings" },
];
