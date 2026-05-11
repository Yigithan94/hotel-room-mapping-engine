import {
  pgTable,
  serial,
  integer,
  real,
  timestamp,
  text,
  jsonb,
  pgEnum,
  varchar,
} from "drizzle-orm/pg-core";
import { masterRoomsTable } from "./masterRooms";
import { supplierRoomsTable } from "./supplierRooms";

export const mappingStatusEnum = pgEnum("mapping_status", [
  "pending_review",
  "auto_approved",
  "manually_approved",
  "rejected",
]);

export const roomMappingsTable = pgTable("room_mappings", {
  id: serial("id").primaryKey(),
  masterRoomId: integer("master_room_id")
    .notNull()
    .references(() => masterRoomsTable.id),
  supplierRoomId: integer("supplier_room_id")
    .notNull()
    .references(() => supplierRoomsTable.id),
  confidenceScore: real("confidence_score").notNull(),
  status: mappingStatusEnum("status").notNull().default("pending_review"),
  featureScores: jsonb("feature_scores").notNull().default({}),
  mappedBy: varchar("mapped_by", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mappingFeedbackTable = pgTable("mapping_feedback", {
  id: serial("id").primaryKey(),
  mappingId: integer("mapping_id")
    .notNull()
    .references(() => roomMappingsTable.id),
  action: varchar("action", { length: 20 }).notNull(),
  correctMasterRoomId: integer("correct_master_room_id"),
  notes: text("notes"),
  usedInTraining: integer("used_in_training").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RoomMapping = typeof roomMappingsTable.$inferSelect;
export type InsertRoomMapping = typeof roomMappingsTable.$inferInsert;
export type MappingFeedback = typeof mappingFeedbackTable.$inferSelect;
export type InsertMappingFeedback = typeof mappingFeedbackTable.$inferInsert;
