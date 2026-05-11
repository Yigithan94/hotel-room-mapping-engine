import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  LayoutDashboard,
  CheckSquare,
  BedDouble,
  Building2,
  Network,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Review Queue", href: "/review", icon: CheckSquare },
  { name: "Master Rooms", href: "/rooms", icon: BedDouble },
  { name: "Hotels", href: "/hotels", icon: Building2 },
  { name: "Suppliers", href: "/suppliers", icon: Network },
  { name: "Excel Import", href: "/import", icon: Upload },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex h-14 items-center px-4 font-semibold tracking-tight text-sidebar-foreground">
        <Building2 className="mr-2 h-5 w-5 text-sidebar-primary" />
        Mapping Engine
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="grid gap-1 px-2">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground font-semibold text-xs">
            ME
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sidebar-foreground">Admin User</span>
            <span className="text-xs text-sidebar-foreground/70">Mapping Analyst</span>
          </div>
        </div>
      </div>
    </div>
  );
}
