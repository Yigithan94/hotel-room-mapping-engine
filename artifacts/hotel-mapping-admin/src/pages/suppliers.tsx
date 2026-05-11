import { useListSuppliers, useTriggerMapping } from "@workspace/api-client-react";
import { getListSuppliersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, PlayCircle, RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SuppliersPage() {
  const { data, isLoading } = useListSuppliers();
  const triggerMutation = useTriggerMapping();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTriggerSync = (supplierId: string, supplierName: string) => {
    triggerMutation.mutate(
      {
        data: { supplierId }
      },
      {
        onSuccess: (res) => {
          toast({
            title: `Sync triggered for ${supplierName}`,
            description: `Processed ${res.roomsProcessed} rooms. ${res.autoApproved} auto-approved.`,
          });
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        }
      }
    );
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Supplier Connectors</h1>
          <p className="text-muted-foreground mt-1">
            Manage data streams from connected OTAs, bedbanks, and wholesalers.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-[150px]" />
                <Skeleton className="h-4 w-[200px]" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))
        ) : data?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-card border rounded-lg">
            No suppliers connected.
          </div>
        ) : (
          data?.map((supplier) => (
            <Card key={supplier.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                      <Network className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                      <CardDescription className="font-mono text-xs mt-1">ID: {supplier.id}</CardDescription>
                    </div>
                  </div>
                  {supplier.syncStatus === "active" ? (
                    <Badge variant="outline" className="text-green-500 border-green-500/30">Active</Badge>
                  ) : supplier.syncStatus === "paused" ? (
                    <Badge variant="outline" className="text-muted-foreground">Paused</Badge>
                  ) : (
                    <Badge variant="destructive">Error</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="space-y-4 mb-6">
                  <p className="text-sm text-muted-foreground">
                    {supplier.description}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Total Rooms</div>
                      <div className="font-medium">{supplier.totalRooms.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Last Sync</div>
                      <div className="font-medium text-sm flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {supplier.lastSyncAt ? new Date(supplier.lastSyncAt).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={() => handleTriggerSync(supplier.id, supplier.name)}
                  disabled={triggerMutation.isPending || supplier.syncStatus !== "active"}
                  className="w-full"
                  variant="secondary"
                >
                  {triggerMutation.isPending && triggerMutation.variables?.data.supplierId === supplier.id ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-2 h-4 w-4" />
                  )}
                  Run Deduplication Task
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
