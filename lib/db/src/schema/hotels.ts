import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const hotelsTable = pgTable("hotels", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Hotel = typeof hotelsTable.$inferSelect;
export type InsertHotel = typeof hotelsTable.$inferInsert;
