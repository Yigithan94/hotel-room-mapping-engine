import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { useListSuppliers, useListHotels, useImportRooms, useValidateImport } from "@workspace/api-client-react";
import type { ImportRoomsBody, ImportRoomRow } from "@workspace/api-client-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  ArrowRight, ArrowLeft, Download, RefreshCw, ChevronRight, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3 | 4;

const SYSTEM_FIELDS: Array<{ key: keyof ImportRoomRow | "skip"; label: string; required: boolean; hint?: string }> = [
  { key: "supplierRoomCode", label: "Room Code", required: true, hint: "Unique ID per supplier" },
  { key: "rawName", label: "Room Name", required: true, hint: "Full room name from supplier" },
  { key: "hotelName", label: "Hotel Name", required: false, hint: "Used if no default hotel" },
  { key: "roomType", label: "Room Type", required: false, hint: "standard/superior/deluxe/suite…" },
  { key: "bedType", label: "Bed Type", required: false, hint: "king/queen/double/twin…" },
  { key: "bedCount", label: "Bed Count", required: false },
  { key: "areaSqm", label: "Area (sqm)", required: false },
  { key: "maxOccupancy", label: "Max Occupancy", required: false },
  { key: "amenities", label: "Amenities", required: false, hint: "Comma-separated" },
  { key: "viewType", label: "View Type", required: false, hint: "sea/pool/garden/city…" },
  { key: "pricePerNight", label: "Price / Night", required: true },
  { key: "currency", label: "Currency", required: false, hint: "USD/EUR/TRY…" },
  { key: "skip", label: "— Skip column —", required: false },
];

function autoDetectMapping(headers: string[]): Record<string, keyof ImportRoomRow | "skip"> {
  const result: Record<string, keyof ImportRoomRow | "skip"> = {};
  const lower = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, "");

  const candidates: Array<[RegExp, keyof ImportRoomRow | "skip"]> = [
    [/roomcode|roomid|supplierroomcode|code|room_code|oda_kod|oda_id/, "supplierRoomCode"],
    [/roomname|name|rawname|oda_ad|odaadi|room_name|oda_isim/, "rawName"],
    [/hotelname|hotel_name|otelad|otel_adi|property/, "hotelName"],
    [/roomtype|type|tip|kategori|category|room_type|oda_tip/, "roomType"],
    [/bedtype|yatak_tip|yataktipi|bed_type/, "bedType"],
    [/bedcount|bed_count|yatak_sayisi|beds/, "bedCount"],
    [/area|sqm|m2|oda_m2|metrekare|size/, "areaSqm"],
    [/occupancy|kapasite|capacity|kisi|max_occ/, "maxOccupancy"],
    [/amenities|olanaklar|ozellikler|features|facilities/, "amenities"],
    [/view|manzara|viewtype|view_type/, "viewType"],
    [/price|fiyat|rate|ucret|price_per_night|nightly/, "pricePerNight"],
    [/currency|para_birimi|doviz|cur/, "currency"],
  ];

  for (const header of headers) {
    const h = lower(header);
    const match = candidates.find(([re]) => re.test(h));
    result[header] = match ? match[1] : "skip";
  }

  return result;
}

function parseExcelRows(
  sheet: XLSX.WorkSheet,
  mapping: Record<string, keyof ImportRoomRow | "skip">,
): ImportRoomRow[] {
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return jsonRows.map((row) => {
    const mapped: Partial<ImportRoomRow> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field === "skip") continue;
      const val = row[header];
      if (val === "" || val === null || val === undefined) continue;
      if (field === "bedCount" || field === "maxOccupancy") {
        const n = Number(val);
        if (!isNaN(n)) (mapped as Record<string, unknown>)[field] = n;
      } else if (field === "areaSqm" || field === "pricePerNight") {
        const n = Number(String(val).replace(",", "."));
        if (!isNaN(n)) (mapped as Record<string, unknown>)[field] = n;
      } else {
        (mapped as Record<string, unknown>)[field as string] = String(val).trim();
      }
    }
    return {
      supplierRoomCode: mapped.supplierRoomCode ?? "",
      rawName: mapped.rawName ?? "",
      pricePerNight: mapped.pricePerNight ?? 0,
      ...mapped,
    } as ImportRoomRow;
  }).filter((r) => r.supplierRoomCode || r.rawName);
}

const TEMPLATE_HEADERS = [
  "room_code", "room_name", "hotel_name", "room_type", "bed_type",
  "bed_count", "area_sqm", "max_occupancy", "amenities", "view_type",
  "price_per_night", "currency",
];

const TEMPLATE_EXAMPLE_ROWS = [
  ["RMD-001", "Deluxe Sea View Room", "Azure Coast Resort", "deluxe", "king", 1, 35, 2, "wifi,minibar,balcony", "sea", 250, "USD"],
  ["RMD-002", "Standard Garden Room", "Azure Coast Resort", "standard", "twin", 2, 25, 2, "wifi,tv", "garden", 120, "USD"],
  ["RMI-001", "Suite Bosphorus", "Grand Palace Hotel", "suite", "king", 1, 60, 3, "wifi,jacuzzi,butler", "city", 450, "USD"],
];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE_ROWS]);
  ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Rooms");
  XLSX.writeFile(wb, "room_import_template.xlsx");
}

type ValidationIssue = { rowIndex: number; field: string; message: string };

export default function ImportPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [sheetData, setSheetData] = useState<{ headers: string[]; previewRows: Record<string, unknown>[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof ImportRoomRow | "skip">>({});
  const [supplierId, setSupplierId] = useState<string>("");
  const [defaultHotelId, setDefaultHotelId] = useState<string>("");
  const [validationResult, setValidationResult] = useState<{
    valid: boolean; totalRows: number; validRows: number;
    issues: ValidationIssue[];
  } | null>(null);
  const [parsedPreviewRows, setParsedPreviewRows] = useState<ImportRoomRow[]>([]);
  const [importResult, setImportResult] = useState<{
    success: boolean; imported: number; skipped: number; errors: number;
    pipelineResults: Array<{
      hotelId: string | null; success: boolean;
      autoApproved: number; pendingReview: number; newMasterRooms: number;
      error?: string | null;
    }>;
    message: string; results: Array<{
      rowIndex: number; supplierRoomCode: string; rawName: string;
      status: "imported" | "skipped" | "error"; reason: string | null;
      mappingStatus: string | null; confidenceScore: number | null;
    }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: suppliersData } = useListSuppliers({});
  const { data: hotelsData } = useListHotels({});
  const validateMutation = useValidateImport();
  const importMutation = useImportRooms();

  const suppliers = suppliersData ?? [];
  const hotels = hotelsData ?? [];

  const handleFileDrop = useCallback((file: File) => {
    setFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: "binary" });
      const firstSheet = wb.Sheets[wb.SheetNames[0]!]!;
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      if (jsonRows.length === 0) {
        toast({ title: "Empty file", description: "No data rows found in the Excel file.", variant: "destructive" });
        return;
      }
      const headers = Object.keys(jsonRows[0]!);
      setSheetData({ headers, previewRows: jsonRows.slice(0, 5) });
      setColumnMapping(autoDetectMapping(headers));
    };
    reader.readAsBinaryString(file);
  }, [toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileDrop(f);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileDrop(f);
  };

  const handleValidate = async () => {
    if (!sheetData || !supplierId) return;
    const wb = XLSX.read(await file!.arrayBuffer(), { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]!]!;
    const rows = parseExcelRows(firstSheet, columnMapping);

    const previewSheet = XLSX.utils.json_to_sheet(sheetData.previewRows);
    setParsedPreviewRows(parseExcelRows(previewSheet, columnMapping));

    try {
      const body: ImportRoomsBody = {
        supplierId,
        defaultHotelId: (defaultHotelId && defaultHotelId !== "_none") ? defaultHotelId : null,
        rows,
      };
      const result = await validateMutation.mutateAsync({ data: body });
      setValidationResult(result as typeof validationResult);
      setStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Validation failed";
      toast({ title: "Validation error", description: msg, variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!sheetData || !supplierId) return;
    const wb = XLSX.read(await file!.arrayBuffer(), { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]!]!;
    const rows = parseExcelRows(firstSheet, columnMapping);

    try {
      const body: ImportRoomsBody = {
        supplierId,
        defaultHotelId: (defaultHotelId && defaultHotelId !== "_none") ? defaultHotelId : null,
        rows,
      };
      const result = await importMutation.mutateAsync({ data: body });
      setImportResult(result as typeof importResult);
      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast({ title: "Import error", description: msg, variant: "destructive" });
    }
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setSheetData(null);
    setColumnMapping({});
    setSupplierId("");
    setDefaultHotelId("");
    setValidationResult(null);
    setParsedPreviewRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const requiredMapped = SYSTEM_FIELDS.filter(f => f.required && f.key !== "skip").every(
    (f) => Object.values(columnMapping).includes(f.key as keyof ImportRoomRow),
  );

  const canProceedStep1 = !!supplierId && !!sheetData;
  const canProceedStep2 = requiredMapped;

  const steps = [
    { id: 1, label: "Upload" },
    { id: 2, label: "Map Columns" },
    { id: 3, label: "Preview" },
    { id: 4, label: "Results" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Excel Import</h1>
          <p className="text-muted-foreground mt-1">
            Import rooms from an Excel file and run them through the mapping pipeline.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
              step > s.id ? "bg-primary text-primary-foreground" :
              step === s.id ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2" :
              "bg-muted text-muted-foreground"
            )}>
              {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
            </div>
            <span className={cn("text-sm", step >= s.id ? "font-medium text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* STEP 1: Upload + Supplier */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier *</label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Hotel <span className="text-muted-foreground">(optional)</span></label>
              <Select value={defaultHotelId} onValueChange={setDefaultHotelId}>
                <SelectTrigger>
                  <SelectValue placeholder="All rows use this hotel if not in Excel…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None (use hotel_name column)</SelectItem>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
                  sheetData ? "border-primary/40 bg-primary/5" : "border-muted hover:border-primary/40 hover:bg-muted/30"
                )}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
                {sheetData ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-primary" />
                    <p className="font-medium">{file?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {sheetData.headers.length} columns · {sheetData.previewRows.length}+ rows detected
                    </p>
                    <Badge variant="outline" className="text-primary border-primary/40">Click to replace</Badge>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="font-medium text-foreground">Drag & drop your Excel file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse — .xlsx, .xls, .csv</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Need a template? Click <strong>Download Template</strong> above for a ready-to-fill Excel file with all supported columns and example rows.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button disabled={!canProceedStep1} onClick={() => setStep(2)}>
              Next: Map Columns <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: Column Mapping */}
      {step === 2 && sheetData && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map Excel Columns to System Fields</CardTitle>
              <CardDescription>
                Match each column from your Excel file to the corresponding system field.
                Required fields are marked with *.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">Excel Column</TableHead>
                    <TableHead className="w-1/4">Sample Value</TableHead>
                    <TableHead>System Field</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetData.headers.map((header) => {
                    const sampleVal = sheetData.previewRows[0]?.[header];
                    const mapped = columnMapping[header];
                    const fieldInfo = SYSTEM_FIELDS.find(f => f.key === mapped);
                    return (
                      <TableRow key={header}>
                        <TableCell className="font-mono text-sm">{header}</TableCell>
                        <TableCell className="text-muted-foreground text-sm truncate max-w-[120px]">
                          {String(sampleVal ?? "—")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={String(mapped ?? "skip")}
                              onValueChange={(v) =>
                                setColumnMapping((prev) => ({ ...prev, [header]: v as keyof ImportRoomRow | "skip" }))
                              }
                            >
                              <SelectTrigger className="h-8 text-sm w-56">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SYSTEM_FIELDS.map((f) => (
                                  <SelectItem key={f.key as string} value={f.key as string}>
                                    {f.label}{f.required ? " *" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {fieldInfo?.hint && (
                              <span className="text-xs text-muted-foreground">{fieldInfo.hint}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {!requiredMapped && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please map required fields: {
                  SYSTEM_FIELDS.filter(f => f.required && f.key !== "skip" && !Object.values(columnMapping).includes(f.key as keyof ImportRoomRow))
                    .map(f => f.label).join(", ")
                }
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              disabled={!canProceedStep2 || validateMutation.isPending}
              onClick={handleValidate}
            >
              {validateMutation.isPending ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Validating…</>
              ) : (
                <>Validate & Preview <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Preview + Validation */}
      {step === 3 && validationResult && sheetData && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{validationResult.totalRows}</div>
                <div className="text-sm text-muted-foreground">Total rows</div>
              </CardContent>
            </Card>
            <Card className="border-green-500/30">
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{validationResult.validRows}</div>
                <div className="text-sm text-muted-foreground">Valid rows</div>
              </CardContent>
            </Card>
            <Card className={validationResult.issues.length > 0 ? "border-red-500/30" : ""}>
              <CardContent className="pt-4">
                <div className={cn("text-2xl font-bold", validationResult.issues.length > 0 ? "text-red-600" : "text-muted-foreground")}>
                  {validationResult.issues.length}
                </div>
                <div className="text-sm text-muted-foreground">Issues found</div>
              </CardContent>
            </Card>
          </div>

          {validationResult.issues.length > 0 && (
            <Card className="border-red-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-600">Validation Issues</CardTitle>
                <CardDescription>These rows will be skipped during import</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {validationResult.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="destructive" className="shrink-0 text-xs">Row {issue.rowIndex + 1}</Badge>
                      <span className="font-medium">{issue.field}:</span>
                      <span className="text-muted-foreground">{issue.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preview (first 5 rows)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Room Code</TableHead>
                    <TableHead>Room Name</TableHead>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedPreviewRows.map((row, i) => {
                    const issue = validationResult.issues.find(is => is.rowIndex === i);
                    return (
                      <TableRow key={i} className={issue ? "bg-red-50/50" : ""}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{row?.supplierRoomCode || "—"}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{row?.rawName || "—"}</TableCell>
                        <TableCell className="text-sm">{row?.hotelName || (defaultHotelId ? hotels.find(h => h.id === defaultHotelId)?.name : "—")}</TableCell>
                        <TableCell>
                          {row?.roomType ? (
                            <Badge variant="secondary" className="text-xs capitalize">{row.roomType}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row?.pricePerNight != null ? `${row.pricePerNight} ${row.currency || "USD"}` : "—"}
                        </TableCell>
                        <TableCell>
                          {issue ? (
                            <Badge variant="destructive" className="text-xs">Error</Badge>
                          ) : (
                            <Badge className="text-xs bg-green-100 text-green-800 border-0">Ready</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {validationResult.validRows === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No valid rows to import. Please fix the issues and try again.</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              disabled={validationResult.validRows === 0 || importMutation.isPending}
              onClick={handleImport}
              className="bg-green-600 hover:bg-green-700"
            >
              {importMutation.isPending ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
              ) : (
                <>Import {validationResult.validRows} Rooms <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Results */}
      {step === 4 && importResult && (
        <div className="space-y-4">
          <Alert className={cn(
            "border",
            importResult.success ? "border-green-500/40 bg-green-50/50" : "border-yellow-500/40 bg-yellow-50/50"
          )}>
            {importResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            )}
            <AlertDescription className="text-sm font-medium">{importResult.message}</AlertDescription>
          </Alert>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Imported", value: importResult.imported, color: "text-green-600" },
              { label: "Skipped (duplicates)", value: importResult.skipped, color: "text-yellow-600" },
              { label: "Errors", value: importResult.errors, color: "text-red-600" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4">
                  <div className={cn("text-2xl font-bold", stat.color)}>{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {importResult.pipelineResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mapping Pipeline — Per Hotel</CardTitle>
                <CardDescription>
                  The mapping engine ran separately for each hotel found in the imported rows.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hotel</TableHead>
                      <TableHead className="text-center">Auto-Approved</TableHead>
                      <TableHead className="text-center">Pending Review</TableHead>
                      <TableHead className="text-center">New Master Rooms</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.pipelineResults.map((pr) => {
                      const hotelName = pr.hotelId
                        ? (hotels.find((h: { id: string; name: string }) => h.id === pr.hotelId)?.name ?? pr.hotelId)
                        : "All hotels (fallback)";
                      return (
                        <TableRow key={pr.hotelId}>
                          <TableCell className="font-medium text-sm">{hotelName}</TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold text-primary">{pr.autoApproved}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold text-orange-500">{pr.pendingReview}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold text-purple-600">{pr.newMasterRooms}</span>
                          </TableCell>
                          <TableCell>
                            {pr.success ? (
                              <Badge className="bg-green-100 text-green-800 border-0 text-xs">Complete</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs" title={pr.error ?? undefined}>Failed</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Row-by-row Results</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Room Code</TableHead>
                    <TableHead>Room Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mapping</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResult.results.map((r) => (
                    <TableRow key={r.rowIndex}>
                      <TableCell className="text-muted-foreground">{r.rowIndex + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{r.supplierRoomCode}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{r.rawName}</TableCell>
                      <TableCell>
                        {r.status === "imported" && <Badge className="bg-green-100 text-green-800 border-0 text-xs">Imported</Badge>}
                        {r.status === "skipped" && <Badge variant="secondary" className="text-xs">Skipped</Badge>}
                        {r.status === "error" && <Badge variant="destructive" className="text-xs">Error</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.mappingStatus === "auto_approved" && <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">Auto-approved</Badge>}
                        {r.mappingStatus === "pending_review" && <Badge className="bg-orange-100 text-orange-800 border-0 text-xs">Review needed</Badge>}
                        {r.mappingStatus === "pending" && <Badge variant="outline" className="text-xs">Queued</Badge>}
                        {!r.mappingStatus && "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Import Another File
            </Button>
            <Button onClick={() => window.location.href = `${import.meta.env.BASE_URL}review`}>
              Go to Review Queue <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
