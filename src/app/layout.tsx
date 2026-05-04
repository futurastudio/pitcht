import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/context/AuthContext";
import { InterviewProvider } from "@/context/InterviewContext";
import { CameraProvider } from "@/context/CameraContext";
import VideoFeed from "@/components/VideoFeed";
import GlobalOnboarding from "@/components/GlobalOnboarding";
import { Toaster } from "sonner";
import { PostHogProvider } from "@/components/PostHogProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pitcht",
  description: "AI Interview Prep",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PostHogProvider>
          {/* Load MediaPipe Face Mesh from CDN */}
          {/* Note: Error handling is done in VideoFeed.tsx during initialization */}
          <Script
            src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"
            strategy="beforeInteractive"
          />

          <AuthProvider>
            <InterviewProvider>
              <CameraProvider>
                {/* Persistent Video Background */}
                <VideoFeed />
                {/* Page Content */}
                <div className="relative z-10 w-full h-full">
                  {children}
                </div>
                {/* First-time onboarding overlay — mounted globally so it fires
                    on whichever route a new signup lands on (not just `/`). */}
                <GlobalOnboarding />
              </CameraProvider>
            </InterviewProvider>
          </AuthProvider>
          {/* Analytics */}
          <Analytics />
          {/* Toast Notifications */}
          <Toaster position="top-right" richColors />
        </PostHogProvider>
      </body>
    </html>
  );
}
