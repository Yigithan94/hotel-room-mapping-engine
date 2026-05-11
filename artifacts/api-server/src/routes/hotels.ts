import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  hotelsTable,
  masterRoomsTable,
  supplierRoomsTable,
  roomMappingsTable,
  suppliersTable,
} from "@workspace/db";
import { eq, count, and, sql } from "drizzle-orm";
import { ListHotelsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/v1/hotels", async (req, res): Promise<void> => {
  const hotels = await db.select().from(hotelsTable).orderBy(hotelsTable.name);

  const result = await Promise.all(
    hotels.map(async (hotel) => {
      const [masterCount] = await db
        .select({ count: count() })
        .from(masterRoomsTable)
        .where(eq(masterRoomsTable.hotelId, hotel.id));

      const [supplierCount] = await db
        .select({ count: count() })
        .from(supplierRoomsTable)
        .where(eq(supplierRoomsTable.hotelId, hotel.id));

      const masterRooms = await db
        .select({ id: masterRoomsTable.id })
        .from(masterRoomsTable)
        .where(eq(masterRoomsTable.hotelId, hotel.id));

      const masterRoomIds = masterRooms.map((r) => r.id);

      let pendingCount = 0;
      if (masterRoomIds.length > 0) {
        const [pending] = await db
          .select({ count: count() })
          .from(roomMappingsTable)
          .where(
            and(
              sql`${roomMappingsTable.masterRoomId} = ANY(${sql.raw(`ARRAY[${masterRoomIds.join(",")}]::int[]`)})`,
              eq(roomMappingsTable.status, "pending_review"),
            ),
          );
        pendingCount = Number(pending?.count ?? 0);
      }

      return {
        id: hotel.id,
        name: hotel.name,
        location: hotel.location,
        totalMasterRooms: Number(masterCount?.count ?? 0),
        totalSupplierRooms: Number(supplierCount?.count ?? 0),
        pendingReview: pendingCount,
      };
    }),
  );

  const validated = ListHotelsResponse.safeParse(result);
  if (!validated.success) {
    req.log.error({ error: validated.error }, "ListHotels response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validated.data);
});

router.get("/v1/hotels/:hotelId/rooms", async (req, res): Promise<void> => {
  const hotelId = String(req.params["hotelId"]);

  const masterRooms = await db
    .select()
    .from(masterRoomsTable)
    .where(eq(masterRoomsTable.hotelId, hotelId));

  if (masterRooms.length === 0) {
    res.json([]);
    return;
  }

  const result = await Promise.all(
    masterRooms.map(async (room) => {
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
            eq(roomMappingsTable.masterRoomId, room.id),
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

      const allPrices = prices.map((p) => p.pricePerNight);
      const lowestPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
      const highestPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;

      return {
        masterRoomId: room.id,
        canonicalName: room.canonicalName,
        roomType: room.roomType,
        bedConfig: room.bedConfig,
        areaSqm: room.areaSqm,
        maxOccupancy: room.maxOccupancy,
        amenities: room.amenities,
        viewType: room.viewType,
        lowestPrice,
        highestPrice,
        currency: prices[0]?.currency ?? "USD",
        supplierCount: prices.length,
        prices,
      };
    }),
  );

  res.json(result);
});

export default router;
