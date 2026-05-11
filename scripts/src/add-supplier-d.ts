import { db } from "@workspace/db";
import {
  suppliersTable,
  supplierRoomsTable,
} from "@workspace/db";
import { TextNormalizer } from "../../artifacts/api-server/src/lib/normalizer";
import { runMappingPipeline } from "../../artifacts/api-server/src/lib/mappingEngine";

const normalizer = new TextNormalizer();

const rooms = [
  // Azure Coast Resort — Supplier D uses French/European abbreviations + EUR pricing
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-001",
    rawName: "Chambre Deluxe Grand Lit Vue Mer",
    roomType: "deluxe",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 42,
    maxOccupancy: 2,
    amenities: ["wifi", "minibar", "climatisation", "balcon", "vue_mer"],
    viewType: "sea",
    pricePerNight: 258,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-002",
    rawName: "Suite Prestige Terrasse Piscine",
    roomType: "suite",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 68,
    maxOccupancy: 3,
    amenities: ["wifi", "minibar", "terrasse", "piscine", "climatisation"],
    viewType: "pool",
    pricePerNight: 415,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-003",
    rawName: "Chambre Std 2 Lits Simples Jardin",
    roomType: "standard",
    bedConfig: [{ type: "twin", count: 2 }],
    areaSqm: 30,
    maxOccupancy: 2,
    amenities: ["wifi", "climatisation"],
    viewType: "garden",
    pricePerNight: 120,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-004",
    rawName: "Penthouse Vue Panoramique Mer",
    roomType: "suite",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 120,
    maxOccupancy: 4,
    amenities: ["wifi", "minibar", "jacuzzi", "concierge", "piscine_privee", "vue_mer"],
    viewType: "sea",
    pricePerNight: 780,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-005",
    rawName: "Villa Privée avec Piscine",
    roomType: "villa",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 180,
    maxOccupancy: 4,
    amenities: ["wifi", "piscine_privee", "concierge", "cuisine", "jardin"],
    viewType: "garden",
    pricePerNight: 1080,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-006",
    rawName: "Chambre Supérieure Lit King Piscine",
    roomType: "superior",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 38,
    maxOccupancy: 2,
    amenities: ["wifi", "minibar", "climatisation", "acces_piscine"],
    viewType: "pool",
    pricePerNight: 190,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-007",
    rawName: "Chambre Familiale Jardin 4 Pers",
    roomType: "standard",
    bedConfig: [{ type: "double", count: 1 }, { type: "twin", count: 2 }],
    areaSqm: 55,
    maxOccupancy: 4,
    amenities: ["wifi", "climatisation", "vue_jardin"],
    viewType: "garden",
    pricePerNight: 175,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-008",
    rawName: "Suite Lune de Miel Jacuzzi Privé",
    roomType: "suite",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 85,
    maxOccupancy: 2,
    amenities: ["wifi", "jacuzzi_prive", "champagne", "petales_roses", "vue_mer"],
    viewType: "sea",
    pricePerNight: 580,
    currency: "EUR",
  },
  // A brand-new room type D has that others don't — a Studio apartment
  {
    supplierId: "supplier-d",
    hotelId: "hotel-azure-coast",
    supplierRoomCode: "VLT-AZC-009",
    rawName: "Studio Apartment Sea Facing Kitchenette",
    roomType: "studio",
    bedConfig: [{ type: "double", count: 1 }],
    areaSqm: 35,
    maxOccupancy: 2,
    amenities: ["wifi", "kitchenette", "climatisation", "vue_mer"],
    viewType: "sea",
    pricePerNight: 165,
    currency: "EUR",
  },
  // Grand Palace Hotel — Supplier D
  {
    supplierId: "supplier-d",
    hotelId: "hotel-grand-palace",
    supplierRoomCode: "VLT-GP-001",
    rawName: "Chambre Deluxe Bosphore Grand Lit",
    roomType: "deluxe",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 45,
    maxOccupancy: 2,
    amenities: ["wifi", "minibar", "climatisation", "vue_bosphore"],
    viewType: "sea",
    pricePerNight: 295,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-grand-palace",
    supplierRoomCode: "VLT-GP-002",
    rawName: "Suite Ottoman Panorama Ville",
    roomType: "suite",
    bedConfig: [{ type: "king", count: 1 }],
    areaSqm: 110,
    maxOccupancy: 2,
    amenities: ["wifi", "minibar", "concierge", "vue_panoramique", "jacuzzi"],
    viewType: "city",
    pricePerNight: 720,
    currency: "EUR",
  },
  {
    supplierId: "supplier-d",
    hotelId: "hotel-grand-palace",
    supplierRoomCode: "VLT-GP-003",
    rawName: "Chambre Standard Vue Ville Lit Double",
    roomType: "standard",
    bedConfig: [{ type: "double", count: 1 }],
    areaSqm: 28,
    maxOccupancy: 2,
    amenities: ["wifi", "climatisation"],
    viewType: "city",
    pricePerNight: 152,
    currency: "EUR",
  },
];

async function main() {
  console.log("Inserting supplier-d (RoomVault Global)...");

  await db
    .insert(suppliersTable)
    .values({
      id: "supplier-d",
      name: "RoomVault Global",
      description: "European GDS aggregator with EUR-based pricing",
      syncStatus: "active",
    })
    .onConflictDoNothing();

  console.log(`Inserting ${rooms.length} rooms...`);

  for (const room of rooms) {
    const normalized = normalizer.normalize(room.rawName);
    await db
      .insert(supplierRoomsTable)
      .values({
        supplierId: room.supplierId,
        hotelId: room.hotelId,
        supplierRoomCode: room.supplierRoomCode,
        rawName: room.rawName,
        normalizedName: normalized,
        roomType: room.roomType,
        bedConfig: room.bedConfig,
        areaSqm: room.areaSqm,
        maxOccupancy: room.maxOccupancy,
        amenities: room.amenities,
        viewType: room.viewType,
        pricePerNight: room.pricePerNight,
        currency: room.currency,
        rawData: room,
      })
      .onConflictDoNothing();
  }

  console.log("Running mapping pipeline for supplier-d...");
  const result = await runMappingPipeline("supplier-d");
  console.log("Mapping complete:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
