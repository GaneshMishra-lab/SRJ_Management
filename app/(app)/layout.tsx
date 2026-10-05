import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/dal";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <Sidebar user={{ name: user.name, role: user.role }} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-900/50">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
