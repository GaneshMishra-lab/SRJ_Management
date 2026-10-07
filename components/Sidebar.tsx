"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  ShoppingBag,
  Package,
  ShoppingCart,
  WalletCards,
  Gem,
  ClipboardList,
  Wrench,
  Recycle,
  HandCoins,
  Banknote,
  Scale,
  Boxes,
  Contact,
  Users,
  ScrollText,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { iconButtonClass } from "@/lib/styles";
import type { Theme } from "@/lib/theme";

// Grouped the way the shop thinks about its work, like the sections of a Finder sidebar.
const sections = [
  {
    title: null,
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Trade",
    items: [
      { name: "Sales", href: "/sales", icon: ShoppingCart },
      { name: "Purchases", href: "/purchases", icon: ShoppingBag },
      { name: "Inventory", href: "/inventory", icon: Package },
      { name: "Orders", href: "/orders", icon: ClipboardList },
      { name: "Repairs", href: "/repairs", icon: Wrench },
      { name: "Old Gold", href: "/old-gold", icon: Recycle },
      { name: "Misc Items", href: "/misc", icon: Boxes },
    ],
  },
  {
    title: "Money",
    items: [
      { name: "Day Book", href: "/daybook", icon: BookOpen },
      { name: "Cash Ledger", href: "/ledgers", icon: WalletCards },
      { name: "Metal & Langdi", href: "/metal", icon: Scale },
      { name: "Gold Loans", href: "/gold-loans", icon: HandCoins },
      { name: "Loans", href: "/loans", icon: Banknote },
      { name: "Parties", href: "/parties", icon: Contact },
    ],
  },
];

const ownerSection = {
  title: "Owner",
  items: [
    { name: "Users", href: "/users", icon: Users },
    { name: "Audit Log", href: "/audit-log", icon: ScrollText },
  ],
};

const itemClass = "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors";

export function Sidebar({
  user,
  defaultCollapsed = false,
  theme,
}: {
  user: { name: string; role: string };
  defaultCollapsed?: boolean;
  theme: Theme;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // On a wide screen the sidebar can be closed down to a strip of icons; a cookie remembers the choice.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggleCollapsed = () => {
    document.cookie = `sidebar=${collapsed ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
    setCollapsed(!collapsed);
  };
  // Hidden on a wide screen while the sidebar is closed; the phone drawer always shows everything.
  const whenOpen = collapsed ? "lg:hidden" : "";
  const centred = collapsed ? "lg:justify-center lg:px-0" : "";
  // Any link tapped inside the drawer closes it.
  const closeOnLink = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };
  const shown = user.role === "owner" ? [...sections, ownerSection] : sections;
  const initials = user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
    {/* Top bar on phones and tablets; the menu itself slides in from the left. */}
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-sidebar px-3 lg:hidden print:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className={iconButtonClass}>
        <Menu className="h-5 w-5" />
      </button>
      <Gem className="h-5 w-5 shrink-0 text-accent" />
      <span className="truncate font-serif text-lg font-medium text-fg">Shri Ram Jewellers</span>
    </header>

    {open && (
      <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
    )}

    <div
      className={`fixed inset-y-0 left-0 z-40 flex w-68 max-w-[85vw] shrink-0 flex-col border-r border-line bg-sidebar text-fg shadow-pop transition-[transform,width] duration-200 lg:static lg:z-10 lg:h-full lg:max-w-none lg:translate-x-0 lg:shadow-none print:hidden ${
        open ? "translate-x-0" : "-translate-x-full max-lg:invisible"
      } ${collapsed ? "lg:w-17" : ""}`}
    >
      <div className={`flex h-18 shrink-0 items-center gap-2.5 pr-3 pl-5 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
        <Gem className={`h-5 w-5 shrink-0 text-accent ${whenOpen}`} />
        <span className={`truncate font-serif text-[1.0625rem] font-medium tracking-tight text-fg ${whenOpen}`}>Shri Ram Jewellers</span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          title={collapsed ? "Open sidebar" : "Close sidebar"}
          aria-expanded={!collapsed}
          className={`max-lg:hidden ${iconButtonClass} ${collapsed ? "" : "ml-auto"}`}
        >
          {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className={`ml-auto lg:hidden ${iconButtonClass}`}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col" onClick={closeOnLink}>
        <div className={`flex-1 overflow-y-auto px-3 pb-3 ${collapsed ? "lg:px-2.5" : ""}`}>
        {/* The two things done most often, one click away. */}
        <div className="space-y-0.5 pb-3">
          <Link href="/sales/new" title={collapsed ? "New sale" : undefined} className={`${itemClass} ${centred} font-medium text-fg hover:bg-fg/5`}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span className={whenOpen}>New sale</span>
          </Link>
          <Link href="/purchases/new" title={collapsed ? "New purchase" : undefined} className={`${itemClass} ${centred} text-fg-2 hover:bg-fg/5 hover:text-fg`}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className={whenOpen}>New purchase</span>
          </Link>
        </div>

        <nav className="space-y-4" aria-label="Main">
          {shown.map((section) => (
            <div key={section.title ?? "top"} className="space-y-0.5">
              {section.title && (
                <div className={`px-2.5 pb-1 text-xs font-medium text-fg-3 ${whenOpen}`}>{section.title}</div>
              )}
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`${itemClass} ${centred} ${isActive ? "bg-fg/8 font-medium text-fg" : "text-fg-2 hover:bg-fg/5 hover:text-fg"}`}
                  >
                    <item.icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-fg" : "text-fg-3 group-hover:text-fg-2"}`} strokeWidth={1.75} aria-hidden="true" />
                    <span className={whenOpen}>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        </div>

        <div className={`shrink-0 space-y-3 border-t border-line px-3 py-3 ${collapsed ? "lg:px-2.5" : ""}`}>
          <div className={whenOpen}>
            <ThemeSwitch initial={theme} />
          </div>
          <div className={`flex items-center gap-2.5 ${collapsed ? "lg:flex-col" : "pl-1"}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg text-xs font-semibold text-page ${whenOpen}`} aria-hidden="true">{initials}</span>
            <div className={`min-w-0 flex-1 ${whenOpen}`}>
              <p className="truncate text-sm font-medium text-fg">{user.name}</p>
              <p className="text-xs text-fg-3 capitalize">{user.role}</p>
            </div>
            <form action={logout}>
              <button type="submit" aria-label="Log out" title="Log out" className={iconButtonClass}>
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
