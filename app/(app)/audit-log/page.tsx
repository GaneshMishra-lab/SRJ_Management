import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema/entities";
import { requireOwner } from "@/lib/dal";

export default async function AuditLogPage() {
  await requireOwner();

  const entries = await db
    .select({
      id: auditLog.id,
      changedAt: auditLog.changedAt,
      userName: users.name,
      tableName: auditLog.tableName,
      action: auditLog.action,
      recordId: auditLog.recordId,
      newValues: auditLog.newValues,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.changedBy, users.id))
    .orderBy(desc(auditLog.changedAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Audit Log</h1>
        <p className="text-zinc-400 mt-1">Who changed what, and when. Latest 200 entries.</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">When</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Who</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Action</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Table</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 sm:px-6 text-center text-zinc-500">
                    Nothing recorded yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-800/20 transition-colors align-top">
                    <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap">{entry.changedAt.toLocaleString()}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-zinc-200">{entry.userName ?? "Unknown"}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 capitalize">{entry.action}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">{entry.tableName}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <details>
                        <summary className="cursor-pointer font-mono text-xs text-zinc-500">{entry.recordId}</summary>
                        <pre className="mt-2 max-w-xl overflow-x-auto text-xs text-zinc-400">
                          {JSON.stringify(entry.newValues, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
