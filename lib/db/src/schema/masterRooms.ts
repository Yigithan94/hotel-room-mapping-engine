import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  real,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { hotelsTable } from "./hotels";

export const roomTypeEnum = pgEnum("room_type", [
  "standard",
  "superior",
  "deluxe",
  "suite",
  "villa",
  "apartment",
  "studio",
]);

export const viewTypeEnum = pgEnum("view_type", [
  "sea",
  "garden",
  "pool",
  "city",
  "mountain",
  "none",
]);

export const masterRoomsTable = pgTable("master_rooms", {
  id: serial("id").primaryKey(),
  hotelId: varchar("hotel_id", { length: 50 })
    .notNull()
    .references(() => hotelsTable.id),
  canonicalName: text("canonical_name").notNull(),
  roomType: roomTypeEnum("room_type").notNull(),
  bedConfig: jsonb("bed_config").notNull().default([]),
  areaSqm: real("area_sqm"),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  amenities: text("amenities").array().notNull().default([]),
  viewType: viewTypeEnum("view_type"),
  embeddingId: text("embedding_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MasterRoom = typeof masterRoomsTable.$inferSelect;
export type InsertMasterRoom = typeof masterRoomsTable.$inferInsert;
