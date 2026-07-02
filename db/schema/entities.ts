import { integer, pgTable, text, uuid } from "./shared";

export const entity = pgTable("entity", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  type: text("type"),
  contact: integer("contact"),
});

export const miscCategory = pgTable("misc_category", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
});

export const miscItem = pgTable("misc_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: uuid("category").references(() => miscCategory.id),
  name: text("name"),
  desc: text("desc"),
  unit: text("unit"),
});
