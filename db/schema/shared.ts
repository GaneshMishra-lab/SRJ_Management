import { integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// NOTE: Enum-like fields are modeled as text for flexibility and easier future growth.

export { integer, pgTable, real, text, timestamp, uniqueIndex, uuid };
