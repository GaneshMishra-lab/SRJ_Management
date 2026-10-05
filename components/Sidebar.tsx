"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Package, 
  ShoppingCart, 
  WalletCards,
  Gem,
  Settings,
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
  X
} from "lucide-react";
import { logout } from "@/app/actions/auth";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Purchases", href: "/purchases", icon: ShoppingBag },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Sales", href: "/sales", icon: ShoppingCart },
  { name: "Orders", href: "/orders", icon: ClipboardList },
  { name: "Repairs", href: "/repairs", icon: Wrench },
  { name: "Old Gold", href: "/old-gold", icon: Recycle },
  { name: "Gold Loans", href: "/gold-loans", icon: HandCoins },
  { name: "Loans", href: "/loans", icon: Banknote },
  { name: "Cash Ledger", href: "/ledgers", icon: WalletCards },
  { name: "Metal & Langdi", href: "/metal", icon: Scale },
  { name: "Misc Items", href: "/misc", icon: Boxes },
  { name: "Parties", href: "/parties", icon: Contact },
];

const ownerNavigation = [
  { name: "Users", href: "/users", icon: Users },
  { name: "Audit Log", href: "/audit-log", icon: ScrollText },
];

export function Sidebar({ user }: { user: { name: string; role: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Any link tapped inside the drawer closes it.
  const closeOnLink = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };
  const items = user.role === "owner" ? [...navigation, ...ownerNavigation] : navigation;

  return (
    <>
    {/* Top bar on phones and tablets; the menu itself slides in from the left. */}
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="-ml-2 rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 transition-colors"
      >
        <Menu className="h-6 w-6" />
      </button>
      <Gem className="h-5 w-5 shrink-0 text-amber-500" />
      <span className="truncate font-semibold text-zinc-100">Shri Ram Jewellers</span>
    </header>

    {open && (
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
    )}

    <div
      className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col bg-zinc-950 border-r border-zinc-800 text-zinc-100 shadow-2xl transition-transform duration-200 lg:static lg:z-10 lg:h-full lg:max-w-none lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full max-lg:invisible"
      }`}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 px-6 border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-md">
        <div className="bg-amber-500/10 p-2 rounded-lg">
          <Gem className="h-6 w-6 text-amber-500" />
        </div>
        <span className="text-lg font-semibold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">
          Shri Ram Jewellers
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="ml-auto -mr-2 rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 transition-colors lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6" onClick={closeOnLink}>
        <nav className="flex-1 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4 px-2">
            Main Menu
          </div>
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-amber-500/10 text-amber-500 shadow-sm ring-1 ring-amber-500/20"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 shrink-0 transition-colors ${
                    isActive ? "text-amber-500" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-auto pt-6 pb-2">
           <Link
            href="/settings"
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 transition-all duration-200"
          >
            <Settings className="h-5 w-5 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
            Settings
          </Link>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800/50 px-3 pt-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">{user.name}</p>
              <p className="text-xs capitalize text-zinc-500">{user.role}</p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Log out"
                title="Log out"
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-100 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
