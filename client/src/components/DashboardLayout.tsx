import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Archive,
  Activity,
  LayoutDashboard,
  LogOut,
  MapPinned,
  PanelLeft,
  Plus,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { trpc } from "@/lib/trpc";
import { BrandMark } from "./BrandMark";
import HeaderActions from "./HeaderActions";

const menuItems = [
  { key: "dashboard", icon: LayoutDashboard, label: "لوحة القيادة", path: "/" },
  {
    key: "create-telegram",
    icon: Plus,
    label: "إنشاء برقية",
    action: "open-telegram-composer",
  },
  {
    key: "accounts",
    icon: Users,
    label: "إدارة حسابات الشرطيين",
    action: "open-owner-user-management",
    adminOnly: true,
  },
  {
    key: "locations",
    icon: MapPinned,
    label: "خريطة البلاغات والمواقع",
    tab: "locations",
  },
  { key: "units", icon: Users, label: "الوحدات الميدانية", tab: "units" },
  {
    key: "resources",
    icon: Activity,
    label: "إدارة الموارد",
    tab: "resources",
  },
  {
    key: "archive",
    icon: Archive,
    label: "الأرشيف والسجلات المغلقة",
    tab: "archive",
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading, user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (user?.mustChangePassword) setLocation("/profile");
  }, [setLocation, user?.mustChangePassword]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <form
          className="surface-elevated flex w-full max-w-md flex-col gap-6 rounded-[1.5rem] border bg-card/95 p-6 shadow-lg backdrop-blur sm:p-8"
          onSubmit={event => {
            event.preventDefault();
            loginMutation.mutate({ username, password });
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <BrandMark size="lg" />
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              تسجيل الدخول إلى النظام
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              أدخل اسم المستخدم وكلمة المرور الخاصة بالحساب المعتمد.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-sm font-medium">
                اسم المستخدم
              </label>
              <Input
                id="login-username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                dir="ltr"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium">
                كلمة المرور
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                dir="ltr"
                required
              />
            </div>
          </div>

          {loginMutation.error ? (
            <p role="alert" className="text-sm text-destructive text-center">
              {loginMutation.error.message}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={loginMutation.isPending || !username.trim() || !password}
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            {loginMutation.isPending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, setOpen, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const showSidebarBrand = isMobile || !isCollapsed;
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      {!isMobile && !isCollapsed ? (
        <button
          type="button"
          aria-label="إغلاق القائمة الجانبية"
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[1px] transition-opacity"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side="right"
          collapsible="offcanvas"
          className="z-30 border-l-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="border-b border-sidebar-border bg-sidebar/95 px-3 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              {showSidebarBrand ? (
                <BrandMark size="sm" showLabel className="min-w-0" />
              ) : null}
              <button
                onClick={toggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="إغلاق القائمة الجانبية"
                title="إغلاق القائمة"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-3 py-5">
            <p className="mb-3 px-2 text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/55">
              التنقل الرئيسي
            </p>
            <SidebarMenu className="gap-1.5">
              {menuItems
                .filter(item => !item.adminOnly || user?.role === "admin")
                .map(item => {
                  const isActive = location === item.path;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => {
                          if (item.action) {
                            window.dispatchEvent(new CustomEvent(item.action));
                          } else if (item.tab) {
                            window.dispatchEvent(
                              new CustomEvent("open-operations-workspace", {
                                detail: { tab: item.tab },
                              })
                            );
                          } else if (item.path) {
                            setLocation(item.path);
                          }
                        }}
                        tooltip={item.label}
                        className="h-11 rounded-xl px-3 font-medium transition-colors data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:hover:bg-primary/90"
                      >
                        <item.icon
                          className={`h-[18px] w-[18px] ${isActive ? "text-current" : "text-sidebar-foreground/70"}`}
                        />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/20 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
        />
      </div>

      <SidebarInset>
        {!isMobile ? (
          <div
            dir="rtl"
            className="flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger
                className="h-10 w-10 shrink-0 rounded-xl border bg-background shadow-sm hover:bg-accent"
                aria-label={
                  isCollapsed
                    ? "فتح القائمة الجانبية"
                    : "إغلاق القائمة الجانبية"
                }
                title={isCollapsed ? "فتح القائمة" : "إغلاق القائمة"}
              />
              <BrandMark size="sm" />
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                مركز البرقيات
              </h1>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                النظام متصل
              </span>
            </div>
            <HeaderActions />
          </div>
        ) : null}
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-xl border bg-background shadow-sm" />
              <BrandMark size="sm" />
              <span className="text-sm font-bold">مركز البرقيات</span>
              <span className="sr-only">
                {activeMenuItem?.label ?? "القائمة"}
              </span>
            </div>
            <HeaderActions />
          </div>
        )}
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-8 xl:p-10 2xl:p-12">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
