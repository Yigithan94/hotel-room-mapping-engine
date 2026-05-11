import { pgTable, text, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const supplierSyncStatusEnum = pgEnum("supplier_sync_status", [
  "active",
  "paused",
  "error",
]);

export const suppliersTable = pgTable("suppliers", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  syncStatus: supplierSyncStatusEnum("sync_status").notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type InsertSupplier = typeof suppliersTable.$inferInsert;
