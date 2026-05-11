import { useGetHotelRooms, getGetHotelRoomsQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BedDouble, ChevronRight, Users, ExternalLink } from "lucide-react";

export default function HotelRoomsPage() {
  const params = useParams();
  const hotelId = params.id || "";

  const { data, isLoading } = useGetHotelRooms(hotelId, {
    query: {
      enabled: !!hotelId,
      queryKey: getGetHotelRoomsQueryKey(hotelId),
    }
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/hotels">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Unified Room Inventory</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono text-xs">HOTEL ID: {hotelId}</span>
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canonical Room</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Supplier Coverage</TableHead>
                <TableHead className="text-right">Price Range</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No unified rooms found for this hotel.
                  </TableCell>
                </TableRow>
              ) : (
                data?.map((room) => (
                  <TableRow key={room.masterRoomId} className="group">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{room.canonicalName}</span>
                        <span className="text-xs text-muted-foreground mt-1 capitalize">{room.roomType}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <BedDouble className="h-3.5 w-3.5" />
                          {room.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5" />
                          Max {room.maxOccupancy}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex -space-x-2">
                        {room.prices.slice(0, 3).map((p, i) => (
                          <div 
                            key={p.supplierId} 
                            className="h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium"
                            title={p.supplierName}
                          >
                            {p.supplierName.substring(0, 2).toUpperCase()}
                          </div>
                        ))}
                        {room.supplierCount > 3 && (
                          <div className="h-8 w-8 rounded-full border-2 border-background bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-medium z-10">
                            +{room.supplierCount - 3}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {room.lowestPrice > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-primary">
                            {room.currency} {room.lowestPrice.toFixed(0)}
                          </span>
                          {room.highestPrice > room.lowestPrice && (
                            <span className="text-xs text-muted-foreground line-through decoration-muted-foreground/30">
                              {room.currency} {room.highestPrice.toFixed(0)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No pricing</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/rooms/${room.masterRoomId}`}>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
