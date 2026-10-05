import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/entities";
import { setUserActive } from "@/app/actions/users";
import { StaffForm } from "@/components/StaffForm";
import { requireOwner } from "@/lib/dal";

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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Users</h1>
        <p className="text-zinc-400 mt-1">Create staff logins and switch them on or off.</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">New staff login</h2>
        <StaffForm />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Name</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Username</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium">Role</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-center">Status</th>
                <th className="whitespace-nowrap px-4 py-3 sm:px-6 sm:py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {allUsers.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-zinc-200">{user.name}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4">{user.username}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 capitalize">{user.role}</td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      user.isActive
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-zinc-500/10 text-zinc-400"
                    }`}>
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                    {user.id !== owner.id && (
                      <form action={setUserActive.bind(null, user.id, !user.isActive)}>
                        <button type="submit" className="text-sm font-medium text-amber-500 hover:text-amber-400">
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
