import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import OwnerUserManagement from "./features/users/OwnerUserManagement";
import OwnerOrganizationManagement from "./features/organizations/OwnerOrganizationManagement";
import PlatformDocumentSettings from "./features/platform-settings/PlatformDocumentSettings";
import OperationsWorkspace from "./features/admin/OperationsWorkspace";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AuditLogPage from "./features/reports/AuditLog";
import VerifyTelegram from "./pages/VerifyTelegram";
import Profile from "./features/users/Profile";
import About from "./pages/About";
import Terms from "./pages/Terms";
import OwnerDashboardPage from "./pages/OwnerDashboard";

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
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
