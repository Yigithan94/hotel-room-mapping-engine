import { useState, useEffect } from "react";
import {
  useListMappings,
  useReviewMapping,
  useBatchApproveMappings,
  useBatchRejectMappings,
  useListMasterRooms,
  useListUnmappedSupplierRooms,
  useTriggerMapping,
  getListMappingsQueryKey,
  getListUnmappedSupplierRoomsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { CheckCircle2, XCircle, Edit, ListFilter, ChevronsUpDown, Check, RefreshCw, Unlink, BedDouble } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type ConfidenceFilter = "all" | "low" | "medium" | "high";
type ActiveTab = "pending" | "unmapped";

const CONFIDENCE_FILTER_LABELS: Record<ConfidenceFilter, string> = {
  all: "All",
  low: "Low (<75%)",
  medium: "Medium (75–92%)",
  high: "High (≥92%)",
};

const CONFIDENCE_FILTER_COLORS: Record<Exclude<ConfidenceFilter, "all">, string> = {
  low: "bg-destructive",
  medium: "bg-accent",
  high: "bg-green-500",
};

interface CorrectDialogState {
  mappingId: number;
  hotelId: string;
  supplierRoom: {
    rawName: string;
    supplierRoomCode: string;
    bedConfig: Array<{ count: number; type: string }>;
    roomType: string;
  };
}

function MasterRoomCombobox({
  hotelId,
  value,
  onChange,
  resetKey,
}: {
  hotelId: string;
  value: number | null;
  onChange: (id: number) => void;
  resetKey?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
    setOpen(false);
  }, [resetKey]);

  const { data } = useListMasterRooms({ hotelId, limit: 200 });
  const rooms = data?.rooms ?? [];
  const selected = rooms.find((r) => r.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected ? (
            <span className="truncate">{selected.canonicalName}</span>
          ) : (
            <span className="text-muted-foreground">Search master rooms…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or type…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No master rooms found.</CommandEmpty>
            <CommandGroup>
              {rooms.map((room) => (
                <CommandItem
                  key={room.id}
                  value={`${room.canonicalName} ${room.roomType} ${room.id}`}
                  onSelect={() => { onChange(room.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === room.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{room.canonicalName}</span>
                    <span className="text-xs text-muted-foreground">
                      {room.roomType}
                      {room.bedConfig.length > 0 ? ` · ${room.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}` : ""}
                      {" · "}ID {room.id}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function UnmappedRoomsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const triggerMutation = useTriggerMapping();
  const [page, setPage] = useState(1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const { data, isLoading, refetch } = useListUnmappedSupplierRooms({ limit, offset });
  const rooms = data?.rooms ?? [];
  const total = data?.total ?? 0;

  const handleRunMapping = async (supplierId: string, hotelId: string) => {
    try {
      const result = await triggerMutation.mutateAsync({ data: { supplierId, hotelId } });
      toast({
        title: "Mapping triggered",
        description: `${result.autoApproved ?? 0} auto-approved · ${result.pendingReview ?? 0} pending review · ${result.newMasterRooms ?? 0} new master rooms`,
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: getListUnmappedSupplierRoomsQueryKey({}) });
    } catch {
      toast({ title: "Mapping failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-24 bg-card rounded-lg border mt-4">
        <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium">All supplier rooms are mapped</h3>
        <p className="text-muted-foreground mt-2">Every supplier room has been processed by the mapping engine.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span> supplier room{total !== 1 ? "s" : ""} have no mapping yet
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Hotel</TableHead>
                <TableHead>Type / Config</TableHead>
                <TableHead>Price</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{room.rawName}</span>
                      <span className="text-xs font-mono text-muted-foreground">{room.supplierRoomCode}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">{room.supplierName}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{room.hotelName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="secondary" className="capitalize w-fit text-xs">{room.roomType}</Badge>
                      {room.bedConfig.length > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {room.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {room.currency} {room.pricePerNight.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      disabled={triggerMutation.isPending}
                      onClick={() => handleRunMapping(room.supplierId, room.hotelId)}
                    >
                      <RefreshCw className={cn("h-3 w-3", triggerMutation.isPending && "animate-spin")} />
                      Run Mapping
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > limit && (
        <div className="flex items-center justify-between px-2 pt-2 text-sm text-muted-foreground">
          <div>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>("pending");
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const { data, isLoading } = useListMappings({ status: "pending_review", limit, offset });
  const { data: unmappedData } = useListUnmappedSupplierRooms({ limit: 1, offset: 0 });
  const unmappedTotal = unmappedData?.total ?? 0;

  const reviewMutation = useReviewMapping();
  const batchApproveMutation = useBatchApproveMappings();
  const batchRejectMutation = useBatchRejectMappings();

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [correctDialog, setCorrectDialog] = useState<CorrectDialogState | null>(null);
  const [correctNotes, setCorrectNotes] = useState("");
  const [correctMasterId, setCorrectMasterId] = useState<number | null>(null);
  const [batchRejectConfirmOpen, setBatchRejectConfirmOpen] = useState(false);

  const applyConfidenceFilter = (score: number) => {
    if (confidenceFilter === "low") return score < 0.75;
    if (confidenceFilter === "medium") return score >= 0.75 && score < 0.92;
    if (confidenceFilter === "high") return score >= 0.92;
    return true;
  };

  const filteredMappings = data?.mappings.filter((item) =>
    applyConfidenceFilter(item.mapping.confidenceScore)
  );

  const toggleSelectAll = () => {
    if (filteredMappings && selectedIds.length === filteredMappings.length) {
      setSelectedIds([]);
    } else if (filteredMappings) {
      setSelectedIds(filteredMappings.map((m) => m.mapping.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleReview = (id: number, action: "approve" | "reject" | "correct", notes?: string, masterId?: number) => {
    reviewMutation.mutate(
      { mappingId: id, data: { action, notes, correctMasterRoomId: masterId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMappingsQueryKey({ status: "pending_review" }) });
          setSelectedIds((prev) => prev.filter((i) => i !== id));
          if (action === "correct") closeCorrectDialog();
        },
      }
    );
  };

  const closeCorrectDialog = () => {
    setCorrectDialog(null);
    setCorrectNotes("");
    setCorrectMasterId(null);
  };

  const handleBatchApprove = () => {
    if (selectedIds.length === 0) return;
    batchApproveMutation.mutate(
      { data: { mappingIds: selectedIds } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListMappingsQueryKey({ status: "pending_review" }) });
          setSelectedIds([]);
          toast({ title: `${result.approved} mapping${result.approved !== 1 ? "s" : ""} approved` });
        },
      }
    );
  };

  const handleBatchReject = () => {
    if (selectedIds.length === 0) return;
    batchRejectMutation.mutate(
      { data: { mappingIds: selectedIds } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListMappingsQueryKey({ status: "pending_review" }) });
          setSelectedIds([]);
          setBatchRejectConfirmOpen(false);
          toast({ title: `${result.rejected} mapping${result.rejected !== 1 ? "s" : ""} rejected` });
        },
      }
    );
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.92) return "text-green-500";
    if (score >= 0.75) return "text-accent";
    return "text-destructive";
  };

  const formatFeatures = (scores: { semanticSimilarity: number; fuzzyStringMatch: number; bedConfigMatch: number; areaMatch: number; amenityOverlap: number }) => [
    { subject: 'Semantic', A: scores.semanticSimilarity * 100, fullMark: 100 },
    { subject: 'Fuzzy', A: scores.fuzzyStringMatch * 100, fullMark: 100 },
    { subject: 'Bed', A: scores.bedConfigMatch * 100, fullMark: 100 },
    { subject: 'Area', A: scores.areaMatch * 100, fullMark: 100 },
    { subject: 'Amenity', A: scores.amenityOverlap * 100, fullMark: 100 },
  ];

  const isFiltered = confidenceFilter !== "all";
  const pendingTotal = data?.total ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            Resolve uncertain mappings and process unmapped supplier rooms.
          </p>
        </div>
        {activeTab === "pending" && selectedIds.length > 0 && (
          <div className="flex items-center gap-3">
            <Button variant="destructive" onClick={() => setBatchRejectConfirmOpen(true)} disabled={batchRejectMutation.isPending}>
              <XCircle className="mr-2 h-4 w-4" />
              Batch Reject ({selectedIds.length})
            </Button>
            <Button onClick={handleBatchApprove} disabled={batchApproveMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Batch Approve ({selectedIds.length})
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setActiveTab("pending")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "pending"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Pending Review
          {pendingTotal > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">{pendingTotal}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("unmapped")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2",
            activeTab === "unmapped"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Unlink className="h-3.5 w-3.5" />
          Unmapped Rooms
          {unmappedTotal > 0 && (
            <Badge variant="destructive" className="text-xs">{unmappedTotal}</Badge>
          )}
        </button>
      </div>

      {/* PENDING REVIEW TAB */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="relative">
                  <ListFilter className="mr-2 h-4 w-4" />
                  Filter
                  {isFiltered && (
                    <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${CONFIDENCE_FILTER_COLORS[confidenceFilter as Exclude<ConfidenceFilter, "all">]}`} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-2">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">Confidence Score</p>
                {(["all", "low", "medium", "high"] as ConfidenceFilter[]).map((option) => (
                  <button
                    key={option}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-muted transition-colors ${confidenceFilter === option ? "bg-muted font-medium" : ""}`}
                    onClick={() => {
                      setConfidenceFilter(option);
                      setPage(1);
                      setSelectedIds([]);
                      setFilterOpen(false);
                    }}
                  >
                    {option !== "all" && <span className={`h-2 w-2 rounded-full flex-shrink-0 ${CONFIDENCE_FILTER_COLORS[option]}`} />}
                    {option === "all" && <span className="h-2 w-2" />}
                    {CONFIDENCE_FILTER_LABELS[option]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ))
          ) : filteredMappings?.length === 0 ? (
            <div className="text-center py-24 bg-card rounded-lg border">
              <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">
                {isFiltered ? "No mappings match this filter" : "Queue is empty"}
              </h3>
              <p className="text-muted-foreground mt-2">
                {isFiltered ? "Try a different confidence range or clear the filter." : "All mappings have been reviewed."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center px-2">
                <Checkbox
                  checked={filteredMappings !== undefined && filteredMappings.length > 0 && selectedIds.length === filteredMappings.length}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="ml-3 text-sm font-medium">Select All</span>
                {isFiltered && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    — showing {filteredMappings?.length} of {data?.mappings.length} ({CONFIDENCE_FILTER_LABELS[confidenceFilter]})
                  </span>
                )}
              </div>

              {filteredMappings?.map((item) => (
                <Card key={item.mapping.id} className={selectedIds.includes(item.mapping.id) ? "border-primary" : ""}>
                  <CardContent className="p-0">
                    <div className="flex flex-col lg:flex-row">
                      <div className="p-6 flex-1 border-b lg:border-b-0 lg:border-r">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedIds.includes(item.mapping.id)}
                              onCheckedChange={() => toggleSelect(item.mapping.id)}
                            />
                            <Badge variant="outline" className="font-mono">{item.mapping.supplierName}</Badge>
                          </div>
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${getConfidenceColor(item.mapping.confidenceScore)}`}>
                              {(item.mapping.confidenceScore * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">Confidence Score</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Supplier Room</h4>
                            <div className="bg-muted/50 p-4 rounded-md space-y-2">
                              <div className="font-medium">{item.supplierRoom.rawName}</div>
                              <div className="text-sm text-muted-foreground flex justify-between">
                                <span>Code: {item.supplierRoom.supplierRoomCode}</span>
                                <span>{item.supplierRoom.roomType}</span>
                              </div>
                              <div className="text-sm">
                                {item.supplierRoom.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}
                              </div>
                              <div className="text-sm font-medium mt-2 text-primary">
                                {item.supplierRoom.currency} {item.supplierRoom.pricePerNight.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Suggested Master Room</h4>
                            <div className="bg-primary/5 p-4 rounded-md border border-primary/20 space-y-2">
                              <div className="font-medium">{item.masterRoom.canonicalName}</div>
                              <div className="text-sm text-muted-foreground flex justify-between">
                                <span>ID: {item.masterRoom.id}</span>
                                <span>{item.masterRoom.roomType}</span>
                              </div>
                              <div className="text-sm">
                                {item.masterRoom.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}
                              </div>
                              {item.masterRoom.areaSqm && (
                                <div className="text-sm text-muted-foreground mt-2">
                                  {item.masterRoom.areaSqm} sqm • Max {item.masterRoom.maxOccupancy} pax
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="w-full lg:w-64 p-6 flex flex-col justify-between bg-muted/20">
                        <div className="h-40 w-full mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={formatFeatures(item.mapping.featureScores)}>
                              <PolarGrid stroke="hsl(var(--border))" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                              <Radar name="Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                              <RechartsTooltip />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button onClick={() => handleReview(item.mapping.id, "approve")} disabled={reviewMutation.isPending} className="w-full">
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Approve Match
                          </Button>
                          <Button variant="destructive" onClick={() => handleReview(item.mapping.id, "reject")} disabled={reviewMutation.isPending} className="w-full">
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject Match
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setCorrectDialog({
                                mappingId: item.mapping.id,
                                hotelId: item.masterRoom.hotelId,
                                supplierRoom: {
                                  rawName: item.supplierRoom.rawName,
                                  supplierRoomCode: item.supplierRoom.supplierRoomCode,
                                  bedConfig: item.supplierRoom.bedConfig,
                                  roomType: item.supplierRoom.roomType,
                                },
                              });
                              setCorrectNotes("");
                              setCorrectMasterId(null);
                            }}
                            className="w-full"
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Correct Manually
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}

          {!isLoading && data && data.total > limit && (
            <div className="flex items-center justify-between px-2 pt-2 text-sm text-muted-foreground">
              <div>Showing {offset + 1} to {Math.min(offset + limit, data.total)} of {data.total}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { setPage(p => p - 1); setSelectedIds([]); }}>Previous</Button>
                <Button variant="outline" size="sm" disabled={offset + limit >= data.total} onClick={() => { setPage(p => p + 1); setSelectedIds([]); }}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UNMAPPED ROOMS TAB */}
      {activeTab === "unmapped" && <UnmappedRoomsTab />}

      {/* Correct Dialog */}
      <Dialog open={correctDialog !== null} onOpenChange={(open) => { if (!open) closeCorrectDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manually Correct Mapping</DialogTitle>
            <DialogDescription>Select the correct master room for this supplier room.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {correctDialog && (
              <div className="rounded-md border bg-muted/40 p-4 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Supplier Room Being Corrected</p>
                <p className="font-medium text-sm">{correctDialog.supplierRoom.rawName}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Code: {correctDialog.supplierRoom.supplierRoomCode}</span>
                  <span>·</span>
                  <span>{correctDialog.supplierRoom.roomType}</span>
                  {correctDialog.supplierRoom.bedConfig.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{correctDialog.supplierRoom.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}</span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Correct Master Room</label>
              {correctDialog && (
                <MasterRoomCombobox
                  hotelId={correctDialog.hotelId}
                  value={correctMasterId}
                  onChange={setCorrectMasterId}
                  resetKey={correctDialog.mappingId}
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Textarea value={correctNotes} onChange={(e) => setCorrectNotes(e.target.value)} placeholder="Why are you correcting this?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCorrectDialog}>Cancel</Button>
            <Button
              disabled={!correctMasterId || reviewMutation.isPending}
              onClick={() => {
                if (correctDialog && correctMasterId) {
                  handleReview(correctDialog.mappingId, "correct", correctNotes || undefined, correctMasterId);
                }
              }}
            >
              Save Correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Reject Confirm */}
      <AlertDialog open={batchRejectConfirmOpen} onOpenChange={setBatchRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selectedIds.length} mapping{selectedIds.length !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {selectedIds.length} mapping{selectedIds.length !== 1 ? "s" : ""} as rejected. This action can be reviewed later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject {selectedIds.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
