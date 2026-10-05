import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/entities";
import { setUserActive } from "@/app/actions/users";
import { StaffForm } from "@/components/StaffForm";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { requireOwner } from "@/lib/dal";
import { btn, rowClass, tableWrapClass, tdClass, thClass } from "@/lib/styles";

export default async function UsersPage() {
  const owner = await requireOwner();

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .orderBy(asc(users.id));

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Create staff logins and switch them on or off." />

      <Card title="New staff login">
        <StaffForm />
      </Card>

      <div className={tableWrapClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-fg-2">
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Username</th>
                <th className={thClass}>Role</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => (
                <tr key={user.id} className={rowClass}>
                  <td className={`${tdClass} font-medium text-fg`}>{user.name}</td>
                  <td className={tdClass}>{user.username}</td>
                  <td className={`${tdClass} capitalize`}>{user.role}</td>
                  <td className={tdClass}>
                    <StatusBadge tone={user.isActive ? "ok" : "neutral"}>{user.isActive ? "Active" : "Disabled"}</StatusBadge>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    {user.id !== owner.id && (
                      <form action={setUserActive.bind(null, user.id, !user.isActive)}>
                        <button type="submit" className={btn("secondary", "sm")}>
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
