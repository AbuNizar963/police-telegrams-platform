import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import HeaderActions from "./components/HeaderActions";
import OwnerUserManagement from "./components/OwnerUserManagement";
import OwnerOrganizationManagement from "./components/OwnerOrganizationManagement";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import VerifyTelegram from "./pages/VerifyTelegram";
import Profile from "./pages/Profile";

function DashboardPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeaderActions />
      <DashboardLayout>{children}</DashboardLayout>
      <OwnerUserManagement />
      <OwnerOrganizationManagement />
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/verify/:token" component={VerifyTelegram} />
      <Route path="/profile">
        <DashboardPage>
          <Profile />
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
