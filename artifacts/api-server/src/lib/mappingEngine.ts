import { db } from "@workspace/db";
import {
  masterRoomsTable,
  supplierRoomsTable,
  roomMappingsTable,
  suppliersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { TextNormalizer } from "./normalizer";
import { logger } from "./logger";

const normalizer = new TextNormalizer();

interface BedConfig {
  type: string;
  count: number;
}

interface FeatureScores {
  semanticSimilarity: number;
  fuzzyStringMatch: number;
  bedConfigMatch: number;
  areaMatch: number;
  amenityOverlap: number;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    if (matrix[0]) matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (!matrix[i]) matrix[i] = [];
      const bChar = b[i - 1];
      const aChar = a[j - 1];
      if (bChar === aChar) {
        matrix[i][j] = (matrix[i - 1]?.[j - 1] ?? 0);
      } else {
        matrix[i][j] = Math.min(
          (matrix[i - 1]?.[j - 1] ?? 0) + 1,
          Math.min(
            (matrix[i]?.[j - 1] ?? 0) + 1,
            (matrix[i - 1]?.[j] ?? 0) + 1,
          ),
        );
      }
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return 1 - (matrix[b.length]?.[a.length] ?? maxLen) / maxLen;
}

function tokenSetRatio(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

function fuzzyMatch(a: string, b: string): number {
  const lev = levenshteinSimilarity(a, b);
  const tokenSet = tokenSetRatio(a, b);
  return lev * 0.4 + tokenSet * 0.6;
}

function computeSemanticSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);

  const cosineLike = intersection.length / Math.sqrt(union.size);

  const levenshtein = levenshteinSimilarity(a, b);

  return cosineLike * 0.5 + levenshtein * 0.5;
}

function computeBedConfigMatch(a: BedConfig[], b: BedConfig[]): number {
  if (a.length === 0 && b.length === 0) return 1.0;

  const aSorted = [...a].sort((x, y) =>
    x.type < y.type ? -1 : x.type > y.type ? 1 : 0,
  );
  const bSorted = [...b].sort((x, y) =>
    x.type < y.type ? -1 : x.type > y.type ? 1 : 0,
  );

  if (JSON.stringify(aSorted) === JSON.stringify(bSorted)) return 1.0;

  const aTypes = new Map<string, number>();
  for (const bed of aSorted) {
    aTypes.set(bed.type, (aTypes.get(bed.type) ?? 0) + bed.count);
  }

  const bTypes = new Map<string, number>();
  for (const bed of bSorted) {
    bTypes.set(bed.type, (bTypes.get(bed.type) ?? 0) + bed.count);
  }

  let matches = 0;
  let total = 0;

  const allTypes = new Set([...aTypes.keys(), ...bTypes.keys()]);
  for (const t of allTypes) {
    const aCount = aTypes.get(t) ?? 0;
    const bCount = bTypes.get(t) ?? 0;
    matches += Math.min(aCount, bCount);
    total += Math.max(aCount, bCount);
  }

  return total > 0 ? matches / total : 0.5;
}

function computeAreaMatch(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0.5;
  if (a === 0 || b === 0) return 0.5;

  const diff = Math.abs(a - b) / Math.max(a, b);
  if (diff <= 0.1) return 1.0;
  if (diff <= 0.2) return 0.7;
  if (diff <= 0.35) return 0.4;
  return 0.0;
}

function computeAmenityOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.3;

  const setA = new Set(a.map((x) => x.toLowerCase()));
  const setB = new Set(b.map((x) => x.toLowerCase()));

  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);

  return intersection.length / union.size;
}

function computeConfidenceScore(scores: FeatureScores): number {
  const weights = {
    semanticSimilarity: 0.3,
    fuzzyStringMatch: 0.3,
    bedConfigMatch: 0.2,
    areaMatch: 0.1,
    amenityOverlap: 0.1,
  };

  return (
    scores.semanticSimilarity * weights.semanticSimilarity +
    scores.fuzzyStringMatch * weights.fuzzyStringMatch +
    scores.bedConfigMatch * weights.bedConfigMatch +
    scores.areaMatch * weights.areaMatch +
    scores.amenityOverlap * weights.amenityOverlap
  );
}

export async function runMappingPipeline(
  supplierId: string,
  hotelId?: string,
): Promise<{
  success: boolean;
  message: string;
  roomsProcessed: number;
  autoApproved: number;
  pendingReview: number;
  newMasterRooms: number;
}> {
  const conditions = [eq(supplierRoomsTable.supplierId, supplierId)];
  if (hotelId) {
    conditions.push(eq(supplierRoomsTable.hotelId, hotelId));
  }

  const supplierRooms = await db
    .select()
    .from(supplierRoomsTable)
    .where(and(...conditions));

  let autoApproved = 0;
  let pendingReview = 0;
  let newMasterRooms = 0;

  for (const sRoom of supplierRooms) {
    const existingMapping = await db
      .select()
      .from(roomMappingsTable)
      .where(eq(roomMappingsTable.supplierRoomId, sRoom.id))
      .limit(1);

    if (existingMapping.length > 0) continue;

    const candidates = await db
      .select()
      .from(masterRoomsTable)
      .where(eq(masterRoomsTable.hotelId, sRoom.hotelId));

    const sNormalized = normalizer.normalize(sRoom.rawName);
    const sBedConfig = (sRoom.bedConfig as BedConfig[]) ?? [];

    let bestScore = 0;
    let bestMasterRoomId: number | null = null;
    let bestFeatureScores: FeatureScores | null = null;

    for (const masterRoom of candidates) {
      const mNormalized = normalizer.normalize(masterRoom.canonicalName);
      const mBedConfig = (masterRoom.bedConfig as BedConfig[]) ?? [];

      const featureScores: FeatureScores = {
        semanticSimilarity: computeSemanticSimilarity(sNormalized, mNormalized),
        fuzzyStringMatch: fuzzyMatch(sNormalized, mNormalized),
        bedConfigMatch: computeBedConfigMatch(sBedConfig, mBedConfig),
        areaMatch: computeAreaMatch(sRoom.areaSqm, masterRoom.areaSqm),
        amenityOverlap: computeAmenityOverlap(sRoom.amenities, masterRoom.amenities),
      };

      const score = computeConfidenceScore(featureScores);

      if (score > bestScore) {
        bestScore = score;
        bestMasterRoomId = masterRoom.id;
        bestFeatureScores = featureScores;
      }
    }

    const AUTO_APPROVE_THRESHOLD = 0.92;
    const PENDING_REVIEW_THRESHOLD = 0.75;

    if (bestMasterRoomId !== null && bestScore >= PENDING_REVIEW_THRESHOLD) {
      const status =
        bestScore >= AUTO_APPROVE_THRESHOLD ? "auto_approved" : "pending_review";

      await db.insert(roomMappingsTable).values({
        masterRoomId: bestMasterRoomId,
        supplierRoomId: sRoom.id,
        confidenceScore: bestScore,
        status,
        featureScores: bestFeatureScores ?? {},
        mappedBy: status === "auto_approved" ? "auto" : null,
      });

      if (status === "auto_approved") {
        autoApproved++;
      } else {
        pendingReview++;
      }
    } else {
      const roomType = normalizer.classifyRoomType(sRoom.rawName);

      const [newMasterRoom] = await db
        .insert(masterRoomsTable)
        .values({
          hotelId: sRoom.hotelId,
          canonicalName: normalizer.normalize(sRoom.rawName),
          roomType,
          bedConfig: sRoom.bedConfig,
          areaSqm: sRoom.areaSqm,
          maxOccupancy: sRoom.maxOccupancy,
          amenities: sRoom.amenities,
          viewType: sRoom.viewType as any,
        })
        .returning();

      if (newMasterRoom) {
        await db.insert(roomMappingsTable).values({
          masterRoomId: newMasterRoom.id,
          supplierRoomId: sRoom.id,
          confidenceScore: bestScore,
          status: "auto_approved",
          featureScores: bestFeatureScores ?? {},
          mappedBy: "auto_new",
        });
        newMasterRooms++;
        autoApproved++;
      }
    }
  }

  await db
    .update(suppliersTable)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(suppliersTable.id, supplierId));

  logger.info(
    { supplierId, hotelId, autoApproved, pendingReview, newMasterRooms },
    "Mapping pipeline complete",
  );

  return {
    success: true,
    message: `Mapping pipeline completed for supplier ${supplierId}`,
    roomsProcessed: supplierRooms.length,
    autoApproved,
    pendingReview,
    newMasterRooms,
  };
}
