import { boolean, check, date, integer, numeric, pgTable, pgView, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// NOTE: Enum-like fields are modeled as text for flexibility and easier future growth.

export const auditTimestamps = () => ({
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Exact decimals: weights in grams (3 places), money in rupees (2 places), percentages.
export const grams = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" });
export const rupees = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
export const pct = (name: string) => numeric(name, { precision: 7, scale: 3, mode: "number" });

export { boolean, check, date, integer, pgTable, pgView, text, timestamp, uniqueIndex, uuid };
