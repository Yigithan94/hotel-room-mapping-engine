import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  masterRoomsTable,
  supplierRoomsTable,
  roomMappingsTable,
  suppliersTable,
  mappingFeedbackTable,
} from "@workspace/db";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import {
  ListMappingsQueryParams,
  ListMappingsResponse,
  ReviewMappingParams,
  ReviewMappingBody,
  BatchApproveMappingsBody,
  BatchRejectMappingsBody,
  TriggerMappingBody,
} from "@workspace/api-zod";
import { runMappingPipeline } from "../lib/mappingEngine";

const router: IRouter = Router();

router.get("/v1/mappings", async (req, res): Promise<void> => {
  const parsed = ListMappingsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;
  const status = parsed.success ? parsed.data.status : undefined;

  const conditions = [];
  if (status) {
    conditions.push(
      sql`${roomMappingsTable.status}::text = ${status}`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(roomMappingsTable)
    .where(whereClause);

  const mappings = await db
    .select({
      mapping: roomMappingsTable,
      supplierRoom: supplierRoomsTable,
      supplier: suppliersTable,
      masterRoom: masterRoomsTable,
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
    .innerJoin(
      masterRoomsTable,
      eq(roomMappingsTable.masterRoomId, masterRoomsTable.id),
    )
    .where(whereClause)
    .orderBy(roomMappingsTable.createdAt)
    .limit(Number(limit))
    .offset(Number(offset));

  const result = mappings.map((m) => {
    const rawScores = (m.mapping.featureScores ?? {}) as Record<string, number>;
    const mappingObj = {
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

    const masterRoomObj = {
      id: m.masterRoom.id,
      hotelId: m.masterRoom.hotelId,
      canonicalName: m.masterRoom.canonicalName,
      roomType: m.masterRoom.roomType,
      bedConfig: m.masterRoom.bedConfig,
      areaSqm: m.masterRoom.areaSqm,
      maxOccupancy: m.masterRoom.maxOccupancy,
      amenities: m.masterRoom.amenities,
      viewType: m.masterRoom.viewType,
      mappedSupplierCount: 0,
      pendingReviewCount: 0,
      createdAt: m.masterRoom.createdAt.toISOString(),
    };

    const supplierRoomObj = {
      id: m.supplierRoom.id,
      supplierId: m.supplierRoom.supplierId,
      supplierName: m.supplier.name,
      hotelId: m.supplierRoom.hotelId,
      supplierRoomCode: m.supplierRoom.supplierRoomCode,
      rawName: m.supplierRoom.rawName,
      normalizedName: m.supplierRoom.normalizedName,
      roomType: m.supplierRoom.roomType,
      bedConfig: m.supplierRoom.bedConfig,
      areaSqm: m.supplierRoom.areaSqm,
      maxOccupancy: m.supplierRoom.maxOccupancy,
      amenities: m.supplierRoom.amenities,
      viewType: m.supplierRoom.viewType,
      pricePerNight: m.supplierRoom.pricePerNight,
      currency: m.supplierRoom.currency,
    };

    return {
      mapping: mappingObj,
      masterRoom: masterRoomObj,
      supplierRoom: supplierRoomObj,
    };
  });

  const payload = {
    mappings: result,
    total: Number(totalResult?.count ?? 0),
    limit: Number(limit),
    offset: Number(offset),
  };
  const validated = ListMappingsResponse.safeParse(payload);
  if (!validated.success) {
    req.log.error({ error: validated.error }, "ListMappings response validation failed");
    res.status(500).json({ error: "internal_error", message: "Response validation failed" });
    return;
  }
  res.json(validated.data);
});

router.post(
  "/v1/mappings/:mappingId/review",
  async (req, res): Promise<void> => {
    const params = ReviewMappingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "invalid_params", message: "Invalid mapping ID" });
      return;
    }

    const body = ReviewMappingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid_body", message: body.error.message });
      return;
    }

    const mappingId = Number(params.data.mappingId);
    const { action, correctMasterRoomId, notes } = body.data;

    const [existing] = await db
      .select()
      .from(roomMappingsTable)
      .where(eq(roomMappingsTable.id, mappingId));

    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Mapping not found" });
      return;
    }

    let newStatus: "manually_approved" | "rejected" | "pending_review" =
      "pending_review";

    if (action === "approve") {
      newStatus = "manually_approved";
    } else if (action === "reject") {
      newStatus = "rejected";
    } else if (action === "correct" && correctMasterRoomId != null) {
      await db
        .update(roomMappingsTable)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(roomMappingsTable.id, mappingId));

      const [supplierRoom] = await db
        .select()
        .from(supplierRoomsTable)
        .where(eq(supplierRoomsTable.id, existing.supplierRoomId));

      if (supplierRoom) {
        const featureScores = existing.featureScores as Record<string, number>;
        await db.insert(roomMappingsTable).values({
          masterRoomId: Number(correctMasterRoomId),
          supplierRoomId: existing.supplierRoomId,
          confidenceScore: 1.0,
          status: "manually_approved",
          featureScores: featureScores,
          mappedBy: "human_review",
        });
      }

      await db.insert(mappingFeedbackTable).values({
        mappingId,
        action,
        correctMasterRoomId: Number(correctMasterRoomId),
        notes: notes ?? null,
      });

      res.json({
        success: true,
        message: "Mapping corrected and new mapping created",
        mappingId,
        newStatus: "rejected",
      });
      return;
    }

    await db
      .update(roomMappingsTable)
      .set({ status: newStatus, mappedBy: "human_review", updatedAt: new Date() })
      .where(eq(roomMappingsTable.id, mappingId));

    await db.insert(mappingFeedbackTable).values({
      mappingId,
      action,
      correctMasterRoomId: correctMasterRoomId ? Number(correctMasterRoomId) : null,
      notes: notes ?? null,
    });

    res.json({
      success: true,
      message: `Mapping ${action}d successfully`,
      mappingId,
      newStatus,
    });
  },
);

router.post("/v1/mappings/batch-approve", async (req, res): Promise<void> => {
  const body = BatchApproveMappingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body", message: body.error.message });
    return;
  }

  const { mappingIds } = body.data;

  if (mappingIds.length === 0) {
    res.json({ success: true, approved: 0, failed: 0, message: "No mappings to approve" });
    return;
  }

  const numericIds = mappingIds.map(Number);

  const updated = await db
    .update(roomMappingsTable)
    .set({ status: "manually_approved", mappedBy: "batch_review", updatedAt: new Date() })
    .where(
      and(
        inArray(roomMappingsTable.id, numericIds),
        eq(roomMappingsTable.status, "pending_review"),
      ),
    )
    .returning({ id: roomMappingsTable.id });

  const updatedIds = updated.map((r) => r.id);

  if (updatedIds.length > 0) {
    await Promise.all(
      updatedIds.map((id) =>
        db.insert(mappingFeedbackTable).values({
          mappingId: id,
          action: "approve",
          correctMasterRoomId: null,
          notes: "batch_approved",
        }),
      ),
    );
  }

  const approved = updatedIds.length;
  const failed = numericIds.length - approved;

  res.json({
    success: true,
    approved,
    failed,
    message: `${approved} mappings approved${failed > 0 ? `, ${failed} skipped (not pending)` : ""}`,
  });
});

router.post("/v1/mappings/batch-reject", async (req, res): Promise<void> => {
  const body = BatchRejectMappingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body", message: body.error.message });
    return;
  }

  const { mappingIds } = body.data;

  if (mappingIds.length === 0) {
    res.json({ success: true, rejected: 0, failed: 0, message: "No mappings to reject" });
    return;
  }

  const numericIds = mappingIds.map(Number);

  const updated = await db
    .update(roomMappingsTable)
    .set({ status: "rejected", mappedBy: "batch_review", updatedAt: new Date() })
    .where(
      and(
        inArray(roomMappingsTable.id, numericIds),
        eq(roomMappingsTable.status, "pending_review"),
      ),
    )
    .returning({ id: roomMappingsTable.id });

  const updatedIds = updated.map((r) => r.id);

  if (updatedIds.length > 0) {
    await Promise.all(
      updatedIds.map((id) =>
        db.insert(mappingFeedbackTable).values({
          mappingId: id,
          action: "reject",
          correctMasterRoomId: null,
          notes: "batch_rejected",
        }),
      ),
    );
  }

  const rejected = updatedIds.length;
  const failed = numericIds.length - rejected;

  res.json({
    success: true,
    rejected,
    failed,
    message: `${rejected} mappings rejected${failed > 0 ? `, ${failed} skipped (not pending)` : ""}`,
  });
});

router.post("/v1/mapping/trigger", async (req, res): Promise<void> => {
  const body = TriggerMappingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body", message: body.error.message });
    return;
  }

  const { supplierId, hotelId } = body.data;

  const result = await runMappingPipeline(supplierId, hotelId ?? undefined);

  res.json(result);
});

export default router;
