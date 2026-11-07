import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { I18nProvider, useI18n } from "@/context/I18nContext";
import { ThemeProvider } from "@/components/theme-provider";
import { RouteNavigationManager } from "@/components/RouteNavigationManager";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { safeRedirectPath } from "@/lib/utils";
import { CommandPalette } from "@/components/CommandPalette";

const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Landing = lazy(() => import("./pages/Landing"));
const Estimate = lazy(() => import("./pages/Estimate"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignupPage = lazy(() => import("./pages/auth/SignupPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const GoogleCallbackPage = lazy(() => import("./pages/auth/GoogleCallbackPage"));
const AccountPage = lazy(() => import("./pages/auth/AccountPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/legal/PrivacyPolicyPage"));
const TermsOfServicePage = lazy(() => import("./pages/legal/TermsOfServicePage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));

const queryClient = new QueryClient();

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (isLoading) {
    return (
        <div className="h-screen w-full flex items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      );
  }

  if (!isAuthenticated) {
    const redirectTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from: redirectTo }} />;
  }

  return children;
};

const GuestOnly = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (isLoading) {
    return (
        <div className="h-screen w-full flex items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      );
  }

  if (isAuthenticated) {
    // This fires the moment login succeeds, so it must honour the page the user
    // was sent here from (e.g. a share link), not always the bare workspace.
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={safeRedirectPath(from)} replace />;
  }

  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner position="top-center" closeButton />
            <BrowserRouter>
              <RouteNavigationManager />
              <CommandPalette />
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

const AppRoutes = () => {
  const { t } = useI18n();

  return (
    <ErrorBoundary
      fallback={() => (
        <div className="h-screen w-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>{t("app.pageError")}</p>
          <button type="button" className="text-primary hover:underline" onClick={() => window.location.reload()}>
            {t("app.reload")}
          </button>
        </div>
      )}
    >
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/estimate" element={<Estimate />} />
        <Route
          path="/visualizer"
          element={
            <RequireAuth>
              <Index />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <SignupPage />
            </GuestOnly>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/oauth/google/callback" element={<GoogleCallbackPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};

export default App;
