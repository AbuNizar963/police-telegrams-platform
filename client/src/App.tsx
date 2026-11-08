import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import OwnerUserManagement from "./features/users/OwnerUserManagement";
import OwnerOrganizationManagement from "./features/organizations/OwnerOrganizationManagement";
import PlatformDocumentSettings from "./features/platform-settings/PlatformDocumentSettings";
import OperationsWorkspace from "./features/admin/OperationsWorkspace";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const VerifyTelegram = lazy(() => import("./pages/VerifyTelegram"));
const AuditLogPage = lazy(() => import("./features/reports/AuditLog"));
const Profile = lazy(() => import("./features/users/Profile"));
const About = lazy(() => import("./pages/About"));
const Terms = lazy(() => import("./pages/Terms"));
const OwnerDashboardPage = lazy(() => import("./pages/OwnerDashboard"));

function DashboardPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardLayout>{children}</DashboardLayout>
      <OwnerUserManagement />
      <OwnerOrganizationManagement />
      <PlatformDocumentSettings />
      <OperationsWorkspace />
    </>
  );
}

function Router() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          جارٍ تحميل الصفحة...
        </div>
      }
    >
      <Switch>
        <Route path="/verify/:token" component={VerifyTelegram} />
        <Route path="/owner-dashboard">
          <DashboardPage>
            <OwnerDashboardPage />
          </DashboardPage>
        </Route>
        <Route path="/audit-log">
          <DashboardPage>
            <AuditLogPage />
          </DashboardPage>
        </Route>
        <Route path="/profile">
          <DashboardPage>
            <Profile />
          </DashboardPage>
        </Route>
        <Route path="/about">
          <DashboardPage>
            <About />
          </DashboardPage>
        </Route>
        <Route path="/terms">
          <DashboardPage>
            <Terms />
          </DashboardPage>
        </Route>
        <Route path="/">
          <DashboardPage>
            <Home />
          </DashboardPage>
        </Route>
        <Route path="/404">
          <DashboardPage>
            <NotFound />
          </DashboardPage>
        </Route>
        <Route>
          <DashboardPage>
            <NotFound />
          </DashboardPage>
        </Route>
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
