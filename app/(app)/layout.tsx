import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { dbTarget } from "@/db";
import { getCurrentUser } from "@/lib/dal";
import { dueReminders } from "@/lib/reminders";
import { readTheme } from "@/lib/theme";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const sidebarClosed = cookieStore.get("sidebar")?.value === "closed";
  // Loan and सावकारी accounts whose reminder day has come: a red "!" on Loans until they are dealt with.
  const reminders = await dueReminders();

  return (
    <div className="flex h-dvh flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* On the test branch, every page says so, so that real sales are never entered there. */}
      {dbTarget === "test" && (
        <div role="status" className="shrink-0 bg-warn px-4 py-1.5 text-center text-[13px] font-semibold text-white print:hidden">
          Test database: nothing entered here reaches the shop&apos;s real books.
        </div>
      )}
      {/* On paper the page is not a scrolling window: the whole of it prints, without the sidebar. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row print:block print:min-h-0">
        <Sidebar user={{ name: user.name, role: user.role }} defaultCollapsed={sidebarClosed} theme={readTheme(cookieStore.get("theme")?.value)} alerts={{ "/loans": reminders.length }} />
        {/* Each page starts with its own toolbar, so there is no padding above it. */}
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-page print:overflow-visible print:bg-transparent">
          <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-10 print:max-w-none print:p-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
