import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { StackProvider, StackTheme } from "@stackframe/stack"
import { stackServerApp } from "@/lib/auth/stack-auth"
import { ThemeProvider } from "@/components/theme-provider"
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister"
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget"
import "./globals.css"

export const metadata: Metadata = {
  title: "JARVIS — Central Nervous System",
  description: "Intelligent project management and life operating system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JARVIS",
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
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`} style={{ fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>
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
        <Analytics />
        <ServiceWorkerRegister />
        <FeedbackWidget source="ai-project-planner" />
      </body>
    </html>
  )
}
