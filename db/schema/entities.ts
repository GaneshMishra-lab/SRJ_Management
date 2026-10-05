import { auditTimestamps, boolean, check, integer, pgTable, text, timestamp, uuid } from "./shared";
import { jsonb, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const entity = pgTable(
  "entity",
  {
    ...auditTimestamps(),
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    type: text("type"),
    contact: text("contact"),
  },
  (table) => ({
    typeCheck: check(
      "entity_type_check",
      sql`${table.type} in ('customer', 'supplier', 'staff')`,
    ),
  }),
);

export const miscCategory = pgTable("misc_category", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
});

export const miscItem = pgTable("misc_item", {
  ...auditTimestamps(),
  id: uuid("id").defaultRandom().primaryKey(),
  category: uuid("category").references(() => miscCategory.id),
  name: text("name"),
  desc: text("desc"),
  unit: text("unit"),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    // Staff entity behind this login; empty for the owner.
    entity: uuid("entity").references(() => entity.id),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    roleCheck: check(
      "users_role_check",
      sql`${table.role} in ('owner', 'staff')`,
    ),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    changedBy: integer("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => ({
    actionCheck: check(
      "audit_log_action_check",
      sql`${table.action} in ('insert', 'update', 'delete')`,
    ),
  }),
);
