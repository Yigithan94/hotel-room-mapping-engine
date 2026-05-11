import { useState } from "react";
import { useListHotels } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronRight, Building2 } from "lucide-react";

export default function HotelsPage() {
  const [searchInput, setSearchInput] = useState("");
  const { data, isLoading } = useListHotels();

  const filteredHotels = data?.filter((hotel) =>
    hotel.name.toLowerCase().includes(searchInput.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hotels Directory</h1>
          <p className="text-muted-foreground mt-1">
            Browse all properties managed within the mapping engine.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4 flex flex-row items-center border-b space-y-0 gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search hotels..."
              className="pl-8 bg-muted/50 border-transparent"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Master Rooms</TableHead>
                <TableHead className="text-right">Supplier Rooms</TableHead>
                <TableHead className="text-right">Pending Review</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredHotels?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {searchInput ? `No hotels matching "${searchInput}".` : "No hotels found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredHotels?.map((hotel) => (
                  <TableRow key={hotel.id} className="group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col">
                          <span>{hotel.name}</span>
                          <span className="text-xs text-muted-foreground font-mono mt-0.5">ID: {hotel.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{hotel.location}</TableCell>
                    <TableCell className="text-right font-medium">
                      {hotel.totalMasterRooms}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {hotel.totalSupplierRooms}
                    </TableCell>
                    <TableCell className="text-right">
                      {hotel.pendingReview > 0 ? (
                        <Badge variant="destructive" className="bg-accent text-accent-foreground hover:bg-accent/80">
                          {hotel.pendingReview} mappings
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/hotels/${hotel.id}`}>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="h-4 w-4" />
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
