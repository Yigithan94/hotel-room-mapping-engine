import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  masterRoomsTable,
  supplierRoomsTable,
  roomMappingsTable,
  suppliersTable,
} from "@workspace/db";
import { eq, and, count, sql, ilike } from "drizzle-orm";
import {
  ListMasterRoomsQueryParams,
  ListMasterRoomsResponse,
  GetMasterRoomParams,
  GetMasterRoomResponse,
  GetRoomPricesParams,
  UpdateMasterRoomNameBody,
  UpdateMasterRoomNameParams,
  CreateMasterRoomBody,
  UpdateMasterRoomParams,
  UpdateMasterRoomBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/v1/rooms", async (req, res): Promise<void> => {
  const parsed = ListMasterRoomsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;
  const hotelId = parsed.success ? parsed.data.hotelId : undefined;
  const roomType = parsed.success ? parsed.data.roomType : undefined;
  const search = parsed.success ? parsed.data.search : undefined;

  const conditions = [];
  if (hotelId) {
    conditions.push(eq(masterRoomsTable.hotelId, String(hotelId)));
  }
  if (roomType) {
    conditions.push(sql`${masterRoomsTable.roomType}::text = ${roomType}`);
  }
  if (search) {
    conditions.push(ilike(masterRoomsTable.canonicalName, `%${search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(masterRoomsTable)
    .where(whereClause);

  const rooms = await db
    .select()
    .from(masterRoomsTable)
    .where(whereClause)
    .orderBy(masterRoomsTable.hotelId, masterRoomsTable.canonicalName)
    .limit(Number(limit))
    .offset(Number(offset));

  const roomsWithCounts = await Promise.all(
    rooms.map(async (room) => {
      const [mappedCount] = await db
        .select({ count: count() })
        .from(roomMappingsTable)
        .where(
          and(
            eq(roomMappingsTable.masterRoomId, room.id),
            sql`${roomMappingsTable.status} != 'rejected'`,
          ),
        );

      const [pendingCount] = await db
        .select({ count: count() })
        .from(roomMappingsTable)
        .where(
          and(
            eq(roomMappingsTable.masterRoomId, room.id),
            eq(roomMappingsTable.status, "pending_review"),
          ),
        );

      return {
        id: room.id,
        hotelId: room.hotelId,
        canonicalName: room.canonicalName,
        roomType: room.roomType,
        bedConfig: room.bedConfig,
        areaSqm: room.areaSqm,
        maxOccupancy: room.maxOccupancy,
        amenities: room.amenities,
        viewType: room.viewType,
        mappedSupplierCount: Number(mappedCount?.count ?? 0),
        pendingReviewCount: Number(pendingCount?.count ?? 0),
        createdAt: room.createdAt.toISOString(),
      };
    }),
  );

  const payload = {
    rooms: roomsWithCounts,
    total: Number(totalResult?.count ?? 0),
    limit: Number(limit),
    offset: Number(offset),
  };
  const validated = ListMasterRoomsResponse.safeParse(payload);
  if (!validated.success) {
    req.log.error({ error: validated.error }, "ListMasterRooms response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validated.data);
});

router.get("/v1/rooms/:masterRoomId", async (req, res): Promise<void> => {
  const parsed = GetMasterRoomParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_params", message: "Invalid master room ID" });
    return;
  }

  const masterRoomId = Number(parsed.data.masterRoomId);

  const [room] = await db
    .select()
    .from(masterRoomsTable)
    .where(eq(masterRoomsTable.id, masterRoomId));

  if (!room) {
    res.status(404).json({ error: "not_found", message: "Master room not found" });
    return;
  }

  const mappingsData = await db
    .select({
      mapping: roomMappingsTable,
      supplierRoom: supplierRoomsTable,
      supplier: suppliersTable,
    })
    .from(roomMappingsTable)
    .innerJoin(
      supplierRoomsTable,
      eq(roomMappingsTable.supplierRoomId, supplierRoomsTable.id),
    )
    .innerJoin(
      suppliersTable,
      eq(supplierRoomsTable.supplierId, suppliersTable.id),
    )
    .where(eq(roomMappingsTable.masterRoomId, masterRoomId));

  const [mappedCount] = await db
    .select({ count: count() })
    .from(roomMappingsTable)
    .where(
      and(
        eq(roomMappingsTable.masterRoomId, masterRoomId),
        sql`${roomMappingsTable.status} != 'rejected'`,
      ),
    );

  const [pendingCount] = await db
    .select({ count: count() })
    .from(roomMappingsTable)
    .where(
      and(
        eq(roomMappingsTable.masterRoomId, masterRoomId),
        eq(roomMappingsTable.status, "pending_review"),
      ),
    );

  const mappings = mappingsData.map((m) => {
    const rawScores = (m.mapping.featureScores ?? {}) as Record<string, number>;
    return {
    id: m.mapping.id,
    masterRoomId: m.mapping.masterRoomId,
    supplierRoomId: m.mapping.supplierRoomId,
    supplierId: m.supplierRoom.supplierId,
    supplierName: m.supplier.name,
    supplierRoomCode: m.supplierRoom.supplierRoomCode,
    rawName: m.supplierRoom.rawName,
    normalizedName: m.supplierRoom.normalizedName,
    confidenceScore: m.mapping.confidenceScore,
    status: m.mapping.status,
    featureScores: {
      semanticSimilarity: rawScores["semanticSimilarity"] ?? 0,
      fuzzyStringMatch: rawScores["fuzzyStringMatch"] ?? 0,
      bedConfigMatch: rawScores["bedConfigMatch"] ?? 0,
      areaMatch: rawScores["areaMatch"] ?? 0,
      amenityOverlap: rawScores["amenityOverlap"] ?? 0,
    },
    mappedBy: m.mapping.mappedBy,
    pricePerNight: m.supplierRoom.pricePerNight,
    currency: m.supplierRoom.currency,
    createdAt: m.mapping.createdAt.toISOString(),
    };
  });

  const prices = mappingsData
    .filter((m) => m.mapping.status !== "rejected")
    .map((m) => ({
      supplierId: m.supplierRoom.supplierId,
      supplierName: m.supplier.name,
      supplierRoomCode: m.supplierRoom.supplierRoomCode,
      rawName: m.supplierRoom.rawName,
      pricePerNight: m.supplierRoom.pricePerNight,
      currency: m.supplierRoom.currency,
      confidenceScore: m.mapping.confidenceScore,
      mappingStatus: m.mapping.status,
    }));

  const roomPayload = {
    room: {
      id: room.id,
      hotelId: room.hotelId,
      canonicalName: room.canonicalName,
      roomType: room.roomType,
      bedConfig: room.bedConfig,
      areaSqm: room.areaSqm,
      maxOccupancy: room.maxOccupancy,
      amenities: room.amenities,
      viewType: room.viewType,
      mappedSupplierCount: Number(mappedCount?.count ?? 0),
      pendingReviewCount: Number(pendingCount?.count ?? 0),
      createdAt: room.createdAt.toISOString(),
    },
    prices,
    mappings,
  };
  const validatedRoom = GetMasterRoomResponse.safeParse(roomPayload);
  if (!validatedRoom.success) {
    req.log.error({ error: validatedRoom.error }, "GetMasterRoom response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validatedRoom.data);
});

router.patch("/v1/rooms/:masterRoomId/name", async (req, res): Promise<void> => {
  const paramsParsed = UpdateMasterRoomNameParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "invalid_params", message: "Invalid master room ID" });
    return;
  }

  const bodyParsed = UpdateMasterRoomNameBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "invalid_body", message: bodyParsed.error.message });
    return;
  }

  const masterRoomId = Number(paramsParsed.data.masterRoomId);
  const { canonicalName } = bodyParsed.data;

  const [updated] = await db
    .update(masterRoomsTable)
    .set({ canonicalName: canonicalName.trim() })
    .where(eq(masterRoomsTable.id, masterRoomId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Master room not found" });
    return;
  }

  res.json({
    id: updated.id,
    canonicalName: updated.canonicalName,
    updatedAt: new Date().toISOString(),
  });
});

router.post("/v1/rooms", async (req, res): Promise<void> => {
  const bodyParsed = CreateMasterRoomBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "invalid_body", message: bodyParsed.error.message });
    return;
  }

  const { hotelId, canonicalName, roomType, bedConfig, areaSqm, maxOccupancy, amenities, viewType } = bodyParsed.data;

  if (!hotelId) {
    res.status(400).json({ error: "invalid_body", message: "hotelId is required" });
    return;
  }

  const [created] = await db
    .insert(masterRoomsTable)
    .values({
      hotelId: String(hotelId),
      canonicalName: canonicalName.trim(),
      roomType: roomType as "standard" | "superior" | "deluxe" | "suite" | "villa" | "apartment" | "studio",
      bedConfig: bedConfig as Array<{ count: number; type: string }>,
      areaSqm: areaSqm ?? null,
      maxOccupancy: maxOccupancy,
      amenities: amenities,
      viewType: (viewType ?? null) as "sea" | "garden" | "pool" | "city" | "mountain" | "none" | null,
    })
    .returning();

  res.status(201).json({
    id: created.id,
    hotelId: created.hotelId,
    canonicalName: created.canonicalName,
    roomType: created.roomType,
    bedConfig: created.bedConfig,
    areaSqm: created.areaSqm,
    maxOccupancy: created.maxOccupancy,
    amenities: created.amenities,
    viewType: created.viewType,
    mappedSupplierCount: 0,
    pendingReviewCount: 0,
    createdAt: created.createdAt.toISOString(),
  });
});

router.put("/v1/rooms/:masterRoomId/update", async (req, res): Promise<void> => {
  const paramsParsed = UpdateMasterRoomParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "invalid_params", message: "Invalid master room ID" });
    return;
  }

  const bodyParsed = UpdateMasterRoomBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "invalid_body", message: bodyParsed.error.message });
    return;
  }

  const masterRoomId = Number(paramsParsed.data.masterRoomId);
  const { canonicalName, roomType, bedConfig, areaSqm, maxOccupancy, amenities, viewType } = bodyParsed.data;

  const [updated] = await db
    .update(masterRoomsTable)
    .set({
      canonicalName: canonicalName.trim(),
      roomType: roomType as "standard" | "superior" | "deluxe" | "suite" | "villa" | "apartment" | "studio",
      bedConfig: bedConfig as Array<{ count: number; type: string }>,
      areaSqm: areaSqm ?? null,
      maxOccupancy: maxOccupancy,
      amenities: amenities,
      viewType: (viewType ?? null) as "sea" | "garden" | "pool" | "city" | "mountain" | "none" | null,
      updatedAt: new Date(),
    })
    .where(eq(masterRoomsTable.id, masterRoomId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Master room not found" });
    return;
  }

  const [mappedCount] = await db
    .select({ count: count() })
    .from(roomMappingsTable)
    .where(and(eq(roomMappingsTable.masterRoomId, masterRoomId), sql`${roomMappingsTable.status} != 'rejected'`));

  const [pendingCount] = await db
    .select({ count: count() })
    .from(roomMappingsTable)
    .where(and(eq(roomMappingsTable.masterRoomId, masterRoomId), eq(roomMappingsTable.status, "pending_review")));

  res.json({
    id: updated.id,
    hotelId: updated.hotelId,
    canonicalName: updated.canonicalName,
    roomType: updated.roomType,
    bedConfig: updated.bedConfig,
    areaSqm: updated.areaSqm,
    maxOccupancy: updated.maxOccupancy,
    amenities: updated.amenities,
    viewType: updated.viewType,
    mappedSupplierCount: Number(mappedCount?.count ?? 0),
    pendingReviewCount: Number(pendingCount?.count ?? 0),
    createdAt: updated.createdAt.toISOString(),
  });
});

router.get("/v1/rooms/:masterRoomId/prices", async (req, res): Promise<void> => {
  const parsed = GetRoomPricesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_params", message: "Invalid master room ID" });
    return;
  }

  const masterRoomId = Number(parsed.data.masterRoomId);

  const mappings = await db
    .select({
      mapping: roomMappingsTable,
      supplierRoom: supplierRoomsTable,
      supplier: suppliersTable,
    })
    .from(roomMappingsTable)
    .innerJoin(
      supplierRoomsTable,
      eq(roomMappingsTable.supplierRoomId, supplierRoomsTable.id),
    )
    .innerJoin(
      suppliersTable,
      eq(supplierRoomsTable.supplierId, suppliersTable.id),
    )
    .where(
      and(
        eq(roomMappingsTable.masterRoomId, masterRoomId),
        sql`${roomMappingsTable.status} != 'rejected'`,
      ),
    );

  const prices = mappings.map((m) => ({
    supplierId: m.supplierRoom.supplierId,
    supplierName: m.supplier.name,
    supplierRoomCode: m.supplierRoom.supplierRoomCode,
    rawName: m.supplierRoom.rawName,
    pricePerNight: m.supplierRoom.pricePerNight,
    currency: m.supplierRoom.currency,
    confidenceScore: m.mapping.confidenceScore,
    mappingStatus: m.mapping.status,
  }));

  res.json(prices);
});

export default router;
