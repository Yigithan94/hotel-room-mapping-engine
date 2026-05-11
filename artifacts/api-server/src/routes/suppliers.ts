import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  suppliersTable,
  supplierRoomsTable,
  roomMappingsTable,
  hotelsTable,
} from "@workspace/db";
import { eq, count, sql, notExists, and } from "drizzle-orm";
import { ListSupplierRoomsQueryParams, ListSuppliersResponse, ListUnmappedSupplierRoomsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/v1/suppliers", async (req, res): Promise<void> => {
  const suppliers = await db
    .select()
    .from(suppliersTable)
    .orderBy(suppliersTable.name);

  const result = await Promise.all(
    suppliers.map(async (supplier) => {
      const [roomCount] = await db
        .select({ count: count() })
        .from(supplierRoomsTable)
        .where(eq(supplierRoomsTable.supplierId, supplier.id));

      return {
        id: supplier.id,
        name: supplier.name,
        description: supplier.description,
        totalRooms: Number(roomCount?.count ?? 0),
        lastSyncAt: supplier.lastSyncAt?.toISOString() ?? null,
        syncStatus: supplier.syncStatus,
      };
    }),
  );

  const validated = ListSuppliersResponse.safeParse(result);
  if (!validated.success) {
    req.log.error({ error: validated.error }, "ListSuppliers response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validated.data);
});

router.get("/v1/supplier-rooms", async (req, res): Promise<void> => {
  const parsed = ListSupplierRoomsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;
  const supplierId = parsed.success ? parsed.data.supplierId : undefined;
  const hotelId = parsed.success ? parsed.data.hotelId : undefined;

  const conditions = [];
  if (supplierId) {
    conditions.push(sql`${supplierRoomsTable.supplierId} = ${supplierId}`);
  }
  if (hotelId) {
    conditions.push(sql`${supplierRoomsTable.hotelId} = ${hotelId}`);
  }

  const whereClause = conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(supplierRoomsTable)
    .where(whereClause);

  const rooms = await db
    .select({
      room: supplierRoomsTable,
      supplier: suppliersTable,
    })
    .from(supplierRoomsTable)
    .innerJoin(suppliersTable, eq(supplierRoomsTable.supplierId, suppliersTable.id))
    .where(whereClause)
    .orderBy(supplierRoomsTable.hotelId, supplierRoomsTable.rawName)
    .limit(Number(limit))
    .offset(Number(offset));

  const result = rooms.map((r) => ({
    id: r.room.id,
    supplierId: r.room.supplierId,
    supplierName: r.supplier.name,
    hotelId: r.room.hotelId,
    supplierRoomCode: r.room.supplierRoomCode,
    rawName: r.room.rawName,
    normalizedName: r.room.normalizedName,
    roomType: r.room.roomType,
    bedConfig: r.room.bedConfig,
    areaSqm: r.room.areaSqm,
    maxOccupancy: r.room.maxOccupancy,
    amenities: r.room.amenities,
    viewType: r.room.viewType,
    pricePerNight: r.room.pricePerNight,
    currency: r.room.currency,
  }));

  res.json({
    rooms: result,
    total: Number(totalResult?.count ?? 0),
    limit: Number(limit),
    offset: Number(offset),
  });
});

router.get("/v1/supplier-rooms/unmapped", async (req, res): Promise<void> => {
  const parsed = ListUnmappedSupplierRoomsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;
  const supplierId = parsed.success ? parsed.data.supplierId : undefined;
  const hotelId = parsed.success ? parsed.data.hotelId : undefined;

  const conditions = [];
  if (supplierId) {
    conditions.push(eq(supplierRoomsTable.supplierId, supplierId));
  }
  if (hotelId) {
    conditions.push(eq(supplierRoomsTable.hotelId, hotelId));
  }

  // Only rooms with no mapping entry at all
  conditions.push(
    notExists(
      db
        .select({ one: sql`1` })
        .from(roomMappingsTable)
        .where(eq(roomMappingsTable.supplierRoomId, supplierRoomsTable.id)),
    ),
  );

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(supplierRoomsTable)
    .where(whereClause);

  const rooms = await db
    .select({
      room: supplierRoomsTable,
      supplier: suppliersTable,
      hotel: hotelsTable,
    })
    .from(supplierRoomsTable)
    .innerJoin(suppliersTable, eq(supplierRoomsTable.supplierId, suppliersTable.id))
    .innerJoin(hotelsTable, eq(supplierRoomsTable.hotelId, hotelsTable.id))
    .where(whereClause)
    .orderBy(supplierRoomsTable.hotelId, supplierRoomsTable.rawName)
    .limit(Number(limit))
    .offset(Number(offset));

  const result = rooms.map((r) => ({
    id: r.room.id,
    supplierId: r.room.supplierId,
    supplierName: r.supplier.name,
    hotelId: r.room.hotelId,
    hotelName: r.hotel.name,
    supplierRoomCode: r.room.supplierRoomCode,
    rawName: r.room.rawName,
    roomType: r.room.roomType,
    bedConfig: r.room.bedConfig,
    areaSqm: r.room.areaSqm,
    maxOccupancy: r.room.maxOccupancy,
    pricePerNight: r.room.pricePerNight,
    currency: r.room.currency,
    createdAt: r.room.createdAt.toISOString(),
  }));

  res.json({
    rooms: result,
    total: Number(totalResult?.count ?? 0),
    limit: Number(limit),
    offset: Number(offset),
  });
});

export default router;
