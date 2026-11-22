import type React from "react"
import { Suspense } from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { StackProvider, StackTheme } from "@stackframe/stack"
import { stackServerApp } from "@/lib/auth/stack-auth"
import { ThemeProvider } from "@/components/theme-provider"
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister"
import { NewBuildBar } from "@/components/pwa/NewBuildBar"
import { buildId } from "@/lib/pwa/build-id"
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget"
import { AskSheet } from "@/components/agents/AskSheet"
import { Attention } from "@/components/agents/Attention"
import { UnitMarker } from "@/components/ade/UnitMarker"
import { AssistantDock } from "@/components/ade/AssistantDock"
import { Toaster } from "sonner"
import { AskDialog } from "@/components/ui/AskDialog"
import "./globals.css"
import "./opx-skin.css"
import { StagingMark } from "@/components/StagingMark"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })

export const metadata: Metadata = {
  title: "Planner",
  description: "Intelligent project management and life operating system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Planner",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#262626" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${GeistSans.variable} ${inter.variable} antialiased`} style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <StackProvider app={stackServerApp}>
            <StackTheme>
              {children}
            </StackTheme>
          </StackProvider>
        </ThemeProvider>
        {/* Notices open below the top bar, never over it (Docs & files check, 2026-11-15). */}
        <Toaster position="top-center" theme="system" richColors offset="72px" />
        {/* The product's own question, in place of the browser's confirm and prompt (lib/ui/ask.ts). */}
        <AskDialog />
        <Analytics />
        <ServiceWorkerRegister />
        <NewBuildBar build={buildId()} />
        <FeedbackWidget source="ai-project-planner" />
        <AskSheet />
        <Attention />
        <UnitMarker />
        <StagingMark />
        <Suspense fallback={null}>
          <AssistantDock />
        </Suspense>
      </body>
    </html>
  )
}
