import { useState, useEffect, useRef } from "react";
import {
  useListMasterRooms,
  useListHotels,
  useListSuppliers,
  useTriggerMapping,
  useCreateMasterRoom,
  useUpdateMasterRoom,
  getListMasterRoomsQueryKey,
  MasterRoomRoomType,
  type UpsertMasterRoomBody,
  type BedConfig,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Search, ChevronRight, BedDouble, Users, Maximize, ListFilter, X, Pencil, RefreshCw, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RoomFormDialog, type RoomFormValues } from "@/components/room-form-dialog";

const ROOM_TYPES = Object.values(MasterRoomRoomType);
type RoomType = (typeof MasterRoomRoomType)[keyof typeof MasterRoomRoomType];

export default function MasterRoomsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncSupplierId, setSyncSupplierId] = useState<string>("__all");

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingRoom, setEditingRoom] = useState<{
    id: number;
    hotelId: string;
    canonicalName: string;
    roomType: string;
    bedConfig: { count: number; type: string }[];
    areaSqm: number | null | undefined;
    maxOccupancy: number;
    amenities: string[];
    viewType: string | null | undefined;
  } | null>(null);

  const limit = 20;
  const offset = (page - 1) * limit;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: hotelsData } = useListHotels();
  const hotels = hotelsData ?? [];
  const { data: suppliersData } = useListSuppliers({});
  const suppliers = (suppliersData ?? []) as { id: string; name: string }[];

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const { data, isLoading } = useListMasterRooms({
    limit,
    offset,
    search: search || undefined,
    roomType: selectedRoomType ?? undefined,
    hotelId: selectedHotelId ?? undefined,
  });

  const createMutation = useCreateMasterRoom();
  const updateMutation = useUpdateMasterRoom();
  const triggerMutation = useTriggerMapping();

  const activeFilterCount = (selectedRoomType ? 1 : 0) + (selectedHotelId ? 1 : 0);
  const isFiltered = activeFilterCount > 0;
  const selectedHotelName = hotels.find((h) => h.id === selectedHotelId)?.name;

  const openCreate = () => {
    setFormMode("create");
    setEditingRoom(null);
    setFormOpen(true);
  };

  const openEdit = (room: typeof editingRoom) => {
    setFormMode("edit");
    setEditingRoom(room);
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: RoomFormValues) => {
    const bedConfig = values.bedConfig.map((b) => ({
      count: Number(b.count),
      type: b.type as BedConfig["type"],
    }));
    const areaSqm = values.areaSqm ? Number(values.areaSqm) : null;
    const roomType = values.roomType as UpsertMasterRoomBody["roomType"];
    const viewType = (values.viewType || null) as UpsertMasterRoomBody["viewType"];

    if (formMode === "create") {
      createMutation.mutate(
        {
          data: {
            hotelId: values.hotelId,
            canonicalName: values.canonicalName,
            roomType,
            bedConfig,
            areaSqm,
            maxOccupancy: Number(values.maxOccupancy),
            amenities: values.amenities,
            viewType,
          },
        },
        {
          onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: getListMasterRoomsQueryKey() });
            toast({ title: "Room created", description: `"${result.canonicalName}" added to the registry.` });
            setFormOpen(false);
          },
          onError: () => {
            toast({ title: "Failed to create room", variant: "destructive" });
          },
        }
      );
    } else if (editingRoom) {
      updateMutation.mutate(
        {
          masterRoomId: editingRoom.id,
          data: {
            canonicalName: values.canonicalName,
            roomType,
            bedConfig,
            areaSqm,
            maxOccupancy: Number(values.maxOccupancy),
            amenities: values.amenities,
            viewType,
          },
        },
        {
          onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: getListMasterRoomsQueryKey() });
            toast({ title: "Room updated", description: `"${result.canonicalName}" saved.` });
            setFormOpen(false);
          },
          onError: () => {
            toast({ title: "Failed to update room", variant: "destructive" });
          },
        }
      );
    }
  };

  const handleSync = async () => {
    if (triggerMutation.isPending) return;
    const suppliersToSync = syncSupplierId === "__all"
      ? suppliers.map((s) => s.id)
      : [syncSupplierId];

    if (suppliersToSync.length === 0) {
      toast({ title: "No suppliers found", variant: "destructive" });
      return;
    }

    let total = { autoApproved: 0, pendingReview: 0, newMasterRooms: 0 };
    for (const sid of suppliersToSync) {
      const result = await triggerMutation.mutateAsync({ data: { supplierId: sid, hotelId: null } });
      total.autoApproved += result.autoApproved ?? 0;
      total.pendingReview += result.pendingReview ?? 0;
      total.newMasterRooms += result.newMasterRooms ?? 0;
    }

    queryClient.invalidateQueries({ queryKey: getListMasterRoomsQueryKey() });
    toast({
      title: "Sync complete",
      description: `${total.autoApproved} auto-approved · ${total.pendingReview} pending review · ${total.newMasterRooms} new master rooms`,
    });
    setSyncOpen(false);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Master Rooms</h1>
          <p className="text-muted-foreground mt-1">
            Canonical room inventory derived from deduplicating all suppliers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setSyncOpen(true)}
            disabled={triggerMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", triggerMutation.isPending && "animate-spin")} />
            Sync Mappings
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Room
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4 flex flex-row items-center border-b space-y-0 gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search rooms..."
              className="pl-8 bg-muted/50 border-transparent"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative shrink-0">
                <ListFilter className="mr-2 h-4 w-4" />
                Filter
                {isFiltered && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-3 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room Type</p>
                <div className="space-y-0.5">
                  {ROOM_TYPES.map((type) => (
                    <button
                      key={type}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-muted transition-colors capitalize ${selectedRoomType === type ? "bg-muted font-medium" : ""}`}
                      onClick={() => { setSelectedRoomType((prev) => (prev === type ? null : type)); setPage(1); }}
                    >
                      <span className={`h-2 w-2 rounded-full border flex-shrink-0 ${selectedRoomType === type ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {hotels.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hotel</p>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {hotels.map((hotel) => (
                      <button
                        key={hotel.id}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-muted transition-colors ${selectedHotelId === hotel.id ? "bg-muted font-medium" : ""}`}
                        onClick={() => { setSelectedHotelId((prev) => (prev === hotel.id ? null : hotel.id)); setPage(1); }}
                      >
                        <span className={`h-2 w-2 rounded-full border flex-shrink-0 ${selectedHotelId === hotel.id ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
                        <span className="truncate">{hotel.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isFiltered && (
                <div className="border-t pt-2">
                  <button
                    className="w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    onClick={() => { setSelectedRoomType(null); setSelectedHotelId(null); setPage(1); setFilterOpen(false); }}
                  >
                    <X className="h-3.5 w-3.5 shrink-0" />
                    Clear filters
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </CardHeader>

        {isFiltered && (
          <div className="flex items-center gap-2 px-4 py-2 border-b text-sm text-muted-foreground bg-muted/30">
            <span>Filtering by:</span>
            {selectedRoomType && (
              <Badge variant="secondary" className="capitalize gap-1">
                Type: {selectedRoomType}
                <button onClick={() => { setSelectedRoomType(null); setPage(1); }}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {selectedHotelId && selectedHotelName && (
              <Badge variant="secondary" className="gap-1">
                Hotel: {selectedHotelName}
                <button onClick={() => { setSelectedHotelId(null); setPage(1); }}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {activeFilterCount > 1 && (
              <button onClick={() => { setSelectedRoomType(null); setSelectedHotelId(null); setPage(1); }} className="ml-auto text-xs underline underline-offset-2 hover:text-foreground">
                Clear all
              </button>
            )}
          </div>
        )}

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canonical Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Amenities</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.rooms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {isFiltered || search ? "No rooms match the current filters." : "No master rooms found."}
                    {!isFiltered && !search && (
                      <Button variant="link" className="ml-2 h-auto p-0" onClick={openCreate}>
                        Create your first room
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                data?.rooms.map((room) => (
                  <TableRow key={room.id} className="group">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{room.canonicalName}</span>
                        <span className="text-xs text-muted-foreground font-mono mt-0.5">ID: {room.id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{room.roomType}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1" title="Bed Configuration">
                          <BedDouble className="h-3.5 w-3.5" />
                          {room.bedConfig.reduce((acc: number, bed: { count: number }) => acc + bed.count, 0)}
                        </div>
                        <div className="flex items-center gap-1" title="Max Occupancy">
                          <Users className="h-3.5 w-3.5" />
                          {room.maxOccupancy}
                        </div>
                        {room.areaSqm && (
                          <div className="flex items-center gap-1" title="Area">
                            <Maximize className="h-3.5 w-3.5" />
                            {room.areaSqm}m²
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {room.amenities.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {room.amenities.length} item{room.amenities.length !== 1 ? "s" : ""}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {room.amenities.slice(0, 2).join(", ")}
                            {room.amenities.length > 2 && "…"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {room.mappedSupplierCount} suppliers
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {room.pendingReviewCount > 0 ? (
                        <Badge variant="destructive" className="bg-accent text-accent-foreground hover:bg-accent/80">
                          {room.pendingReviewCount} pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-primary/30 text-primary">Synced</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit room"
                          onClick={() => openEdit({
                            id: room.id,
                            hotelId: room.hotelId,
                            canonicalName: room.canonicalName,
                            roomType: room.roomType,
                            bedConfig: room.bedConfig as { count: number; type: string }[],
                            areaSqm: room.areaSqm,
                            maxOccupancy: room.maxOccupancy,
                            amenities: room.amenities,
                            viewType: room.viewType,
                          })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Link href={`/rooms/${room.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {data && data.total > limit && (
            <div className="flex items-center justify-between px-4 py-4 border-t text-sm text-muted-foreground">
              <div>Showing {offset + 1} to {Math.min(offset + limit, data.total)} of {data.total}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={offset + limit >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Room Form Dialog (create + edit) */}
      <RoomFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        hotels={hotels}
        initialValues={
          editingRoom
            ? {
                canonicalName: editingRoom.canonicalName,
                hotelId: editingRoom.hotelId,
                roomType: editingRoom.roomType,
                bedConfig: editingRoom.bedConfig,
                areaSqm: editingRoom.areaSqm ? String(editingRoom.areaSqm) : "",
                maxOccupancy: editingRoom.maxOccupancy,
                amenities: editingRoom.amenities,
                viewType: editingRoom.viewType ?? "",
              }
            : { hotelId: hotels[0]?.id ?? "" }
        }
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Sync Dialog */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sync Mappings</DialogTitle>
            <DialogDescription>
              Re-run the mapping pipeline to match new supplier rooms to master rooms.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Supplier</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={syncSupplierId}
              onChange={(e) => setSyncSupplierId(e.target.value)}
            >
              <option value="__all">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Runs the AI/ML mapping engine for rooms that don't yet have a confident match.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncOpen(false)}>Cancel</Button>
            <Button onClick={handleSync} disabled={triggerMutation.isPending} className="gap-2">
              {triggerMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Syncing…</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Run Sync</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
