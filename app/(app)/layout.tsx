import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/dal";
import { readTheme } from "@/lib/theme";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const sidebarClosed = cookieStore.get("sidebar")?.value === "closed";

  return (
    // On paper the page is not a scrolling window: the whole of it prints, without the sidebar.
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row print:block print:h-auto print:overflow-visible">
      <Sidebar user={{ name: user.name, role: user.role }} defaultCollapsed={sidebarClosed} theme={readTheme(cookieStore.get("theme")?.value)} />
      {/* Each page starts with its own toolbar, so there is no padding above it. */}
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-page print:overflow-visible print:bg-transparent">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-10 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
