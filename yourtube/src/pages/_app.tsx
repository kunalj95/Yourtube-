import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import LoginOtpVerification from "@/components/LoginOtpVerification";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import {
  UserProvider,
  useUser,
} from "../lib/AuthContext";

const AppContent = ({
  Component,
  pageProps,
}: AppProps) => {
  const {
    authLoading,
    otpRequired,
  } = useUser();

  // =====================================================
  // AUTH LOADING
  // =====================================================

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />

        <div className="flex min-h-[calc(100vh-64px)]">
          <Sidebar />

          <main className="flex min-w-0 flex-1 items-center justify-center">
            <div className="text-sm text-muted-foreground">
              Loading...
            </div>
          </main>
        </div>
      </div>
    );
  }

  // =====================================================
  // OTP VERIFICATION
  // =====================================================

  if (otpRequired) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <title>Your-Tube Clone</title>

        <Header />

        <Toaster />

        <div className="flex min-h-[calc(100vh-64px)]">
          <Sidebar />

          <main className="flex min-w-0 flex-1 items-center justify-center px-4">
            <LoginOtpVerification />
          </main>
        </div>
      </div>
    );
  }

  // =====================================================
  // NORMAL APPLICATION
  // =====================================================

  return (
    <div className="min-h-screen bg-background text-foreground">
      <title>Your-Tube Clone</title>

      <Header />

      <Toaster />

      <div className="flex min-h-[calc(100vh-64px)]">
        <Sidebar />

        <main className="min-w-0 flex-1">
          <Component {...pageProps} />
        </main>
      </div>
    </div>
  );
};

export default function App(
  props: AppProps
) {
  return (
    <UserProvider>
      <AppContent {...props} />
    </UserProvider>
  );
}