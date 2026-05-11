import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  real,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { suppliersTable } from "./suppliers";
import { hotelsTable } from "./hotels";

export const supplierRoomsTable = pgTable("supplier_rooms", {
  id: serial("id").primaryKey(),
  supplierId: varchar("supplier_id", { length: 50 })
    .notNull()
    .references(() => suppliersTable.id),
  hotelId: varchar("hotel_id", { length: 50 })
    .notNull()
    .references(() => hotelsTable.id),
  supplierRoomCode: varchar("supplier_room_code", { length: 100 }).notNull(),
  rawName: text("raw_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  roomType: text("room_type").notNull(),
  bedConfig: jsonb("bed_config").notNull().default([]),
  areaSqm: real("area_sqm"),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  amenities: text("amenities").array().notNull().default([]),
  viewType: text("view_type"),
  pricePerNight: real("price_per_night").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  rawData: jsonb("raw_data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SupplierRoom = typeof supplierRoomsTable.$inferSelect;
export type InsertSupplierRoom = typeof supplierRoomsTable.$inferInsert;
