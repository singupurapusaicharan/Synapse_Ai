import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AnimatedBackground } from "@/components/effects/AnimatedBackground";
import { PageTransition } from "@/components/effects/PageTransition";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import { Auth } from "./pages/Auth";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Sources } from "./pages/Sources";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { GoogleCallback } from "./pages/GoogleCallback";

const queryClient = new QueryClient();

const App = () => {
  console.log('[App] Rendering, current URL:', window.location.href);
  
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <AnimatedBackground />
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
};

export default App;
