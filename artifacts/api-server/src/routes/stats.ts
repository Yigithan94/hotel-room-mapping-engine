import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  masterRoomsTable,
  supplierRoomsTable,
  roomMappingsTable,
  suppliersTable,
  hotelsTable,
} from "@workspace/db";
import { eq, count, avg, sql, desc } from "drizzle-orm";
import { GetDashboardStatsResponse, GetMappingAccuracyResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/v1/stats/dashboard", async (req, res): Promise<void> => {
  const [[totalMasterResult], [totalSupplierResult], [totalHotelsResult], [totalSuppliersResult]] =
    await Promise.all([
      db.select({ count: count() }).from(masterRoomsTable),
      db.select({ count: count() }).from(supplierRoomsTable),
      db.select({ count: count() }).from(hotelsTable),
      db.select({ count: count() }).from(suppliersTable),
    ]);

  const [statusCounts] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE ${roomMappingsTable.status} = 'pending_review')`,
      autoApproved: sql<number>`COUNT(*) FILTER (WHERE ${roomMappingsTable.status} = 'auto_approved')`,
      manuallyApproved: sql<number>`COUNT(*) FILTER (WHERE ${roomMappingsTable.status} = 'manually_approved')`,
      rejected: sql<number>`COUNT(*) FILTER (WHERE ${roomMappingsTable.status} = 'rejected')`,
      avgConfidence: avg(roomMappingsTable.confidenceScore),
    })
    .from(roomMappingsTable);

  const totalMasterRooms = Number(totalMasterResult?.count ?? 0);
  const totalSupplierRooms = Number(totalSupplierResult?.count ?? 0);
  const totalHotels = Number(totalHotelsResult?.count ?? 0);
  const totalSuppliers = Number(totalSuppliersResult?.count ?? 0);
  const pendingReview = Number(statusCounts?.pending ?? 0);
  const autoApproved = Number(statusCounts?.autoApproved ?? 0);
  const manuallyApproved = Number(statusCounts?.manuallyApproved ?? 0);
  const rejected = Number(statusCounts?.rejected ?? 0);
  const avgConfidenceScore = Number(statusCounts?.avgConfidence ?? 0);

  const totalMapped = autoApproved + manuallyApproved + rejected + pendingReview;
  const autoApprovalRate = totalMapped > 0 ? (autoApproved / totalMapped) * 100 : 0;

  const recentMappings = await db
    .select({
      id: roomMappingsTable.id,
      status: roomMappingsTable.status,
      mappedBy: roomMappingsTable.mappedBy,
      confidenceScore: roomMappingsTable.confidenceScore,
      mappingCreatedAt: roomMappingsTable.createdAt,
      supplierRoomName: supplierRoomsTable.rawName,
      masterRoomName: masterRoomsTable.canonicalName,
      masterRoomCreatedAt: masterRoomsTable.createdAt,
    })
    .from(roomMappingsTable)
    .innerJoin(supplierRoomsTable, eq(roomMappingsTable.supplierRoomId, supplierRoomsTable.id))
    .innerJoin(masterRoomsTable, eq(roomMappingsTable.masterRoomId, masterRoomsTable.id))
    .orderBy(desc(roomMappingsTable.createdAt))
    .limit(10);

  const recentActivity = recentMappings.map((m) => {
    let type: "auto_approved" | "pending_review" | "new_master_room" | "manually_reviewed";

    const mappingTime = m.mappingCreatedAt.getTime();
    const masterRoomTime = m.masterRoomCreatedAt.getTime();
    const createdTogether = Math.abs(mappingTime - masterRoomTime) < 5000;

    if (m.status === "auto_approved" && createdTogether) {
      type = "new_master_room";
    } else if (m.status === "auto_approved") {
      type = "auto_approved";
    } else if (m.status === "pending_review") {
      type = "pending_review";
    } else {
      type = "manually_reviewed";
    }

    return {
      id: m.id,
      type,
      description: `"${m.supplierRoomName}" → "${m.masterRoomName}"`,
      confidenceScore: m.confidenceScore,
      timestamp: m.mappingCreatedAt.toISOString(),
    };
  });

  const statsPayload = {
    totalMasterRooms,
    totalSupplierRooms,
    pendingReview,
    autoApproved,
    manuallyApproved,
    rejected,
    autoApprovalRate: Math.round(autoApprovalRate * 10) / 10,
    totalHotels,
    totalSuppliers,
    avgConfidenceScore: Math.round(avgConfidenceScore * 100) / 100,
    recentActivity,
  };
  const validatedStats = GetDashboardStatsResponse.safeParse(statsPayload);
  if (!validatedStats.success) {
    req.log.error({ error: validatedStats.error }, "GetDashboardStats response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validatedStats.data);
});

router.get("/v1/stats/mapping-accuracy", async (req, res): Promise<void> => {
  const rawDays = req.query.days;
  const days = rawDays !== undefined ? parseInt(String(rawDays), 10) : 30;
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "Bad Request", message: "days must be an integer between 1 and 365" });
    return;
  }

  const rows = await db
    .select({
      date: sql<string>`DATE(${roomMappingsTable.createdAt})::text`,
      total: count(),
      autoApproved: sql<number>`COUNT(*) FILTER (WHERE ${roomMappingsTable.status} = 'auto_approved')`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${roomMappingsTable.status} = 'pending_review')`,
    })
    .from(roomMappingsTable)
    .where(sql`${roomMappingsTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`)
    .groupBy(sql`DATE(${roomMappingsTable.createdAt})`)
    .orderBy(sql`DATE(${roomMappingsTable.createdAt})`);

  const result = rows.map((row) => ({
    date: row.date,
    autoApprovalRate: row.total > 0 ? Math.round((Number(row.autoApproved) / Number(row.total)) * 1000) / 10 : 0,
    totalMapped: Number(row.total),
    pendingReview: Number(row.pending),
  }));

  const validatedAccuracy = GetMappingAccuracyResponse.safeParse(result);
  if (!validatedAccuracy.success) {
    req.log.error({ error: validatedAccuracy.error }, "GetMappingAccuracy response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validatedAccuracy.data);
});

export default router;
