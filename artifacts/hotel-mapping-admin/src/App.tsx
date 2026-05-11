import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { MainLayout } from "@/components/layout/main-layout";
import DashboardPage from "@/pages/dashboard";
import ReviewQueuePage from "@/pages/review";
import MasterRoomsPage from "@/pages/rooms";
import MasterRoomDetailPage from "@/pages/rooms/[id]";
import HotelsPage from "@/pages/hotels";
import HotelRoomsPage from "@/pages/hotels/[id]";
import SuppliersPage from "@/pages/suppliers";
import ImportPage from "@/pages/import";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

function Router() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/review" component={ReviewQueuePage} />
        <Route path="/rooms" component={MasterRoomsPage} />
        <Route path="/rooms/:id" component={MasterRoomDetailPage} />
        <Route path="/hotels" component={HotelsPage} />
        <Route path="/hotels/:id" component={HotelRoomsPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/import" component={ImportPage} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
