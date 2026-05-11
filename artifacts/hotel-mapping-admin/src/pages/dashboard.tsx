import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetDashboardStats, useGetMappingAccuracy, getGetDashboardStatsQueryKey, getGetMappingAccuracyQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import {
  BedDouble,
  CheckCircle2,
  Network,
  Clock,
  AlertCircle,
  Activity,
  RefreshCw,
} from "lucide-react";

const DAY_OPTIONS = [7, 14, 30, 90] as const;
type DayOption = typeof DAY_OPTIONS[number];

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<DayOption>(30);

  const { data: stats, isLoading: statsLoading, isFetching: statsFetching } = useGetDashboardStats();
  const { data: accuracy, isLoading: accuracyLoading, isFetching: accuracyFetching } = useGetMappingAccuracy({ days });

  const isRefreshing = statsFetching || accuracyFetching;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMappingAccuracyQueryKey({ days }) });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of the mapping engine status.</p>
        </div>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh dashboard">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {statsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      ) : stats ? (
        <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-4 transition-opacity duration-200 ${statsFetching ? "opacity-50" : "opacity-100"}`}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Master Rooms</CardTitle>
              <BedDouble className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMasterRooms.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                From {stats.totalSupplierRooms.toLocaleString()} supplier rooms
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingReview.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Mappings requiring manual action
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto-Approval Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.autoApprovalRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Average confidence: {(stats.avgConfidenceScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Network Entities</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalHotels.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Hotels across {stats.totalSuppliers} suppliers
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Mapping Accuracy Over Time</CardTitle>
                <CardDescription>
                  Auto-approval rate trend for the past {days} days.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 rounded-md border p-1">
                {DAY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => setDays(option)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      days === option
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {option}d
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pl-2">
            {accuracyLoading ? (
              <Skeleton className="h-[350px] w-full" />
            ) : accuracy ? (
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={accuracy}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorAutoApproval" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Auto-Approval Rate']}
                    />
                    <Area
                      type="monotone"
                      dataKey="autoApprovalRate"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorAutoApproval)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[350px] w-full flex items-center justify-center text-muted-foreground">
                No accuracy data available.
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest mapping events across the network.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-8">
                {stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4">
                    <div className="mt-0.5">
                      {activity.type === "auto_approved" ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : activity.type === "pending_review" ? (
                        <AlertCircle className="h-5 w-5 text-accent" />
                      ) : activity.type === "new_master_room" ? (
                        <BedDouble className="h-5 w-5 text-blue-500" />
                      ) : (
                        <Activity className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {activity.confidenceScore != null && (
                      <div className="text-sm font-medium">
                        {(activity.confidenceScore * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No recent activity.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
