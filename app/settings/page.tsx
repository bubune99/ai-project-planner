"use client"

import { DashboardLayout } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Settings, User, Bell, Palette, Shield, Database, Key } from "lucide-react"

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-muted-foreground">Configure your JARVIS experience</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Settings Categories */}
            <div className="grid gap-4 md:grid-cols-2">
              <SettingsCard
                icon={User}
                title="Profile"
                description="Manage your account settings and preferences"
                href="/settings/profile"
                disabled
              />
              <SettingsCard
                icon={Bell}
                title="Notifications"
                description="Configure alerts and notification preferences"
                href="/settings/notifications"
                disabled
              />
              <SettingsCard
                icon={Palette}
                title="Appearance"
                description="Customize theme, colors, and display options"
                href="/settings/appearance"
                disabled
              />
              <SettingsCard
                icon={Shield}
                title="Privacy & Security"
                description="Manage security settings and data privacy"
                href="/settings/security"
                disabled
              />
              <SettingsCard
                icon={Key}
                title="API Keys"
                description="Manage API keys and integrations"
                href="/settings/api-keys"
                disabled
              />
              <SettingsCard
                icon={Database}
                title="Data & Storage"
                description="Export data, manage storage, and backups"
                href="/settings/data"
                disabled
              />
            </div>

            {/* Coming Soon Notice */}
            <Card className="border-white/10 bg-black/40">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-500/20">
                    <Settings className="h-6 w-6 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Settings Module In Progress</h3>
                    <p className="text-sm text-gray-400">
                      Full settings functionality is being developed. Some options may be limited.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  href,
  disabled
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  href: string
  disabled?: boolean
}) {
  return (
    <Card className={`border-white/10 bg-black/40 ${disabled ? 'opacity-60' : 'hover:bg-black/50 cursor-pointer'}`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
            <Icon className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-white">{title}</h3>
            <p className="text-sm text-gray-400 mt-1">{description}</p>
          </div>
          {disabled && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">Soon</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
