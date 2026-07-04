import { integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// NOTE: Enum-like fields are modeled as text for flexibility and easier future growth.

export const auditTimestamps = () => ({
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export { integer, pgTable, real, text, timestamp, uniqueIndex, uuid };
