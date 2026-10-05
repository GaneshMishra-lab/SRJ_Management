import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema/entities";
import { Empty, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/dal";
import { dateTime } from "@/lib/format";
import { rowClass, tableWrapClass, tdClass, thClass } from "@/lib/styles";

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
      <PageHeader title="Audit Log" subtitle="Who changed what, and when. Latest 200 entries." />

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={thClass}>When</th>
                <th className={thClass}>Who</th>
                <th className={thClass}>Action</th>
                <th className={thClass}>Table</th>
                <th className={thClass}>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={5}><Empty>Nothing recorded yet.</Empty></td></tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className={`${rowClass} align-top`}>
                    <td className={tdClass}>{dateTime(entry.changedAt)}</td>
                    <td className={`${tdClass} font-medium text-fg`}>{entry.userName ?? "Unknown"}</td>
                    <td className={`${tdClass} capitalize`}>{entry.action}</td>
                    <td className={`${tdClass} font-mono text-[13px]`}>{entry.tableName}</td>
                    <td className="px-5 py-3">
                      <details>
                        <summary className="cursor-pointer rounded font-mono text-xs text-fg-3 hover:text-fg">{entry.recordId}</summary>
                        <pre className="mt-2 max-w-xl overflow-x-auto rounded-lg bg-sunken p-3 text-xs text-fg-2">
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
