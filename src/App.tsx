import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AnimatedBackground } from "@/components/effects/AnimatedBackground";
import { PageTransition } from "@/components/effects/PageTransition";
import { ThemeProvider } from "next-themes";

// Route-level code splitting (improves initial load / responsiveness)
const Index = lazy(() => import("./pages/Index"));
const GoogleCallback = lazy(() =>
  import("./pages/GoogleCallback").then((m) => ({ default: m.GoogleCallback }))
);
const Auth = lazy(() => import("./pages/Auth").then((m) => ({ default: m.Auth })));
const ForgotPassword = lazy(() =>
  import("./pages/ForgotPassword").then((m) => ({ default: m.ForgotPassword }))
);
const ResetPassword = lazy(() =>
  import("./pages/ResetPassword").then((m) => ({ default: m.ResetPassword }))
);
const Sources = lazy(() => import("./pages/Sources").then((m) => ({ default: m.Sources })));
const History = lazy(() => import("./pages/History").then((m) => ({ default: m.History })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => {
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <AnimatedBackground />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense
              fallback={
                <div className="h-screen flex items-center justify-center">
                  <div className="flex items-center gap-3 animate-pulse-slow">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent" />
                    <span className="text-lg font-medium">Loading...</span>
                  </div>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<PageTransition><Index /></PageTransition>} />
                <Route path="/google-callback" element={<GoogleCallback />} />
                <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
                <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
                <Route path="/reset-password/:token" element={<PageTransition><ResetPassword /></PageTransition>} />
                <Route path="/sources" element={<PageTransition><Sources /></PageTransition>} />
                <Route path="/history" element={<PageTransition><History /></PageTransition>} />
                <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
};

export default App;
