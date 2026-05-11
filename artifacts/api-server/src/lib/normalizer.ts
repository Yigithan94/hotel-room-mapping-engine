const ABBREVIATIONS: Record<string, string> = {
  dbl: "double",
  std: "standard",
  kng: "king",
  qn: "queen",
  twn: "twin",
  occ: "ocean",
  mtn: "mountain",
  vw: "view",
  jnr: "junior",
  sr: "senior",
  dlx: "deluxe",
  sup: "superior",
  sngl: "single",
  sgl: "single",
  trpl: "triple",
  quad: "quadruple",
  ste: "suite",
  exec: "executive",
  svc: "service",
  inc: "inclusive",
  bb: "bed and breakfast",
  ai: "all inclusive",
  rv: "river",
  lk: "lake",
  cty: "city",
  gdn: "garden",
  pl: "pool",
  oc: "ocean",
};

const TURKISH_TO_ENGLISH: Record<string, string> = {
  deniz: "sea",
  havuz: "pool",
  bahce: "garden",
  sehir: "city",
  kral: "king",
  kralice: "queen",
  dag: "mountain",
  orman: "forest",
  bahçe: "garden",
  şehir: "city",
  kraliçe: "queen",
  dağ: "mountain",
  nehir: "river",
  gol: "lake",
  göl: "lake",
  manzara: "view",
  oda: "room",
  suit: "suite",
  standart: "standard",
  lüks: "deluxe",
  superior: "superior",
};

const STOP_WORDS = new Set([
  "with",
  "and",
  "the",
  "ve",
  "ile",
  "bir",
  "a",
  "an",
  "of",
  "in",
  "at",
  "for",
  "on",
]);

export class TextNormalizer {
  normalize(text: string): string {
    let result = text.toLowerCase();

    result = result.replace(/[^a-z0-9\u00c0-\u024f\s]/g, " ");

    result = this.expandTurkish(result);

    result = this.expandAbbreviations(result);

    result = result
      .split(/\s+/)
      .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
      .join(" ")
      .trim();

    return result;
  }

  private expandAbbreviations(text: string): string {
    let result = text;
    for (const [abbr, expansion] of Object.entries(ABBREVIATIONS)) {
      const regex = new RegExp(`\\b${abbr}\\b`, "gi");
      result = result.replace(regex, expansion);
    }
    return result;
  }

  private expandTurkish(text: string): string {
    let result = text;
    for (const [turkish, english] of Object.entries(TURKISH_TO_ENGLISH)) {
      const regex = new RegExp(`\\b${turkish}\\b`, "gi");
      result = result.replace(regex, english);
    }
    return result;
  }

  classifyRoomType(
    name: string,
  ): "standard" | "superior" | "deluxe" | "suite" | "villa" | "apartment" | "studio" {
    const lower = name.toLowerCase();
    if (lower.includes("villa")) return "villa";
    if (lower.includes("apartment") || lower.includes("apart")) return "apartment";
    if (lower.includes("studio")) return "studio";
    if (lower.includes("suite") || lower.includes("suit")) return "suite";
    if (lower.includes("deluxe") || lower.includes("dlx") || lower.includes("lüks"))
      return "deluxe";
    if (lower.includes("superior") || lower.includes("sup")) return "superior";
    return "standard";
  }
}
