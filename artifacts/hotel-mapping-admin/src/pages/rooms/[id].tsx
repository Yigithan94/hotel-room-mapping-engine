import { useGetMasterRoom, getGetMasterRoomQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BedDouble, CheckCircle2, ChevronRight, HelpCircle, MapPin, Maximize, User, XCircle } from "lucide-react";

export default function MasterRoomDetailPage() {
  const params = useParams();
  const roomId = params.id ? parseInt(params.id) : 0;

  const { data, isLoading } = useGetMasterRoom(roomId, {
    query: {
      enabled: !!roomId,
      queryKey: getGetMasterRoomQueryKey(roomId),
    }
  });

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-[400px] w-full" /></div>;
  }

  if (!data) {
    return <div className="p-8 text-center">Room not found</div>;
  }

  const { room, mappings, prices } = data;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/rooms">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{room.canonicalName}</h1>
            <Badge variant="secondary" className="capitalize text-sm">{room.roomType}</Badge>
          </div>
          <div className="text-muted-foreground mt-1 flex items-center gap-2">
            <span className="font-mono text-xs">ID: {room.id}</span>
            <span>•</span>
            <span>Hotel ID: {room.hotelId}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Canonical Attributes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <BedDouble className="h-3 w-3" /> Beds
                </div>
                <div className="font-medium">
                  {room.bedConfig.map((b) => `${b.count} ${b.type}`).join(", ")}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Occupancy
                </div>
                <div className="font-medium">Max {room.maxOccupancy}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Maximize className="h-3 w-3" /> Area
                </div>
                <div className="font-medium">{room.areaSqm ? `${room.areaSqm} sqm` : 'Unknown'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> View
                </div>
                <div className="font-medium capitalize">{room.viewType || 'Standard'}</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="text-sm text-muted-foreground mb-2">Amenities</div>
              <div className="flex flex-wrap gap-2">
                {room.amenities.map(a => (
                  <Badge key={a} variant="outline" className="bg-muted/50">{a}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price Range</CardTitle>
          </CardHeader>
          <CardContent>
            {prices.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-primary">
                    ${Math.min(...prices.map(p => p.pricePerNight)).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground mb-1">
                    to ${Math.max(...prices.map(p => p.pricePerNight)).toFixed(0)}
                  </span>
                </div>
                <div className="space-y-2 mt-4 pt-4 border-t">
                  {prices.map(p => (
                    <div key={p.supplierId} className="flex justify-between items-center text-sm">
                      <span className="font-medium">{p.supplierName}</span>
                      <span>{p.currency} {p.pricePerNight}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">No pricing data available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Mappings ({mappings.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Supplier Room Code</TableHead>
                <TableHead>Raw Name</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No supplier rooms mapped.
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{m.supplierName}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.supplierRoomCode}</TableCell>
                    <TableCell className="max-w-[300px] truncate" title={m.rawName}>{m.rawName}</TableCell>
                    <TableCell>
                      <div className={`font-medium ${m.confidenceScore >= 0.9 ? 'text-green-500' : m.confidenceScore >= 0.75 ? 'text-accent' : 'text-destructive'}`}>
                        {(m.confidenceScore * 100).toFixed(1)}%
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.status === 'auto_approved' ? (
                        <div className="flex items-center text-green-500 text-sm gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Auto
                        </div>
                      ) : m.status === 'manually_approved' ? (
                        <div className="flex items-center text-primary text-sm gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Manual
                        </div>
                      ) : m.status === 'rejected' ? (
                        <div className="flex items-center text-destructive text-sm gap-1">
                          <XCircle className="h-3 w-3" /> Rejected
                        </div>
                      ) : (
                        <div className="flex items-center text-accent text-sm gap-1">
                          <HelpCircle className="h-3 w-3" /> Review
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.currency} {m.pricePerNight}
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
