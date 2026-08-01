import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  TrendingUp,
  ShieldAlert,
  BrainCircuit,
  Moon,
  Sun
} from "lucide-react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Дашборд", href: "/", icon: LayoutDashboard },
  { name: "Долги и Кредиты", href: "/debts", icon: Wallet },
  { name: "Расходы", href: "/expenses", icon: Receipt },
  { name: "Доходы", href: "/income", icon: TrendingUp },
  { name: "Антикризисный режим", href: "/crisis", icon: ShieldAlert },
  { name: "ИИ-Консультант", href: "/ai", icon: BrainCircuit },
];

function AppSidebar() {
  const [location] = useLocation();
  const { data: summary } = useGetDashboardSummary({ query: { enabled: true, queryKey: ["/api/dashboard"] }});

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground w-full">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <span className="truncate">Финансовый контроль</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Главное меню</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href} className="flex items-center gap-3 w-full">
                        <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-medium">{item.name}</span>
                        {item.name === "Антикризисный режим" && summary?.crisisMode && (
                          <Badge variant="destructive" className="ml-auto text-[10px] uppercase h-5 px-1.5 leading-none rounded-sm">ВКЛ</Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-4">
        {summary?.crisisMode ? (
           <div className="flex items-center gap-2 text-xs text-destructive font-bold p-2 bg-destructive/10 rounded-md">
             <ShieldAlert className="h-4 w-4" />
             КРИЗИСНЫЙ РЕЖИМ АКТИВЕН
           </div>
        ) : (
           <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium p-2">
             <span className="h-2 w-2 rounded-full bg-emerald-500" />
             Стандартный режим
           </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground transition-colors duration-300">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 w-full">
          <header className="h-16 flex items-center gap-4 border-b bg-card px-6 sticky top-0 z-10 transition-colors duration-300">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold truncate flex-1 tracking-tight">Smart Finance & Crisis Manager</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
          </header>
          <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
