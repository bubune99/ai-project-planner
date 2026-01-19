"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Building2,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Wallet,
  MoreVertical,
  Eye,
  EyeOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FinanceAccount, AccountType } from "@/lib/types"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AccountCardProps {
  account: FinanceAccount
  onEdit?: (account: FinanceAccount) => void
  onDelete?: (id: string) => void
}

const accountTypeConfig: Record<AccountType, { icon: typeof Building2; color: string; label: string }> = {
  checking: { icon: Building2, color: "blue", label: "Checking" },
  savings: { icon: PiggyBank, color: "green", label: "Savings" },
  credit_card: { icon: CreditCard, color: "red", label: "Credit Card" },
  investment: { icon: TrendingUp, color: "purple", label: "Investment" },
  cash: { icon: Wallet, color: "yellow", label: "Cash" },
  loan: { icon: CreditCard, color: "orange", label: "Loan" },
  other: { icon: Wallet, color: "gray", label: "Other" },
}

export function AccountCard({ account, onEdit, onDelete }: AccountCardProps) {
  const [showBalance, setShowBalance] = useState(true)
  const config = accountTypeConfig[account.accountType] || accountTypeConfig.other
  const Icon = config.icon
  const isNegative = account.currentBalance < 0 || account.accountType === "credit_card" || account.accountType === "loan"

  return (
    <Card className="border-white/10 bg-black/40 hover:bg-black/50 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            config.color === "blue" && "bg-blue-500/20",
            config.color === "green" && "bg-green-500/20",
            config.color === "red" && "bg-red-500/20",
            config.color === "purple" && "bg-purple-500/20",
            config.color === "yellow" && "bg-yellow-500/20",
            config.color === "orange" && "bg-orange-500/20",
            config.color === "gray" && "bg-gray-500/20",
          )}>
            <Icon className={cn(
              "h-5 w-5",
              config.color === "blue" && "text-blue-400",
              config.color === "green" && "text-green-400",
              config.color === "red" && "text-red-400",
              config.color === "purple" && "text-purple-400",
              config.color === "yellow" && "text-yellow-400",
              config.color === "orange" && "text-orange-400",
              config.color === "gray" && "text-gray-400",
            )} />
          </div>
          <div>
            <CardTitle className="text-sm font-medium text-white">
              {account.name}
            </CardTitle>
            {account.institution && (
              <p className="text-xs text-gray-500">{account.institution}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white"
            onClick={() => setShowBalance(!showBalance)}
          >
            {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-black/90 border-white/10">
              <DropdownMenuItem onClick={() => onEdit?.(account)}>
                Edit Account
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-400"
                onClick={() => onDelete?.(account.id)}
              >
                Delete Account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <p className={cn(
              "text-2xl font-bold",
              showBalance ? (isNegative ? "text-red-400" : "text-white") : "text-gray-400"
            )}>
              {showBalance
                ? formatCurrency(account.currentBalance)
                : "••••••"
              }
            </p>
            <Badge variant="outline" className="mt-2 text-xs border-white/10">
              {config.label}
            </Badge>
          </div>
          {account.lastSyncedAt && (
            <p className="text-xs text-gray-500">
              Updated {formatRelativeTime(account.lastSyncedAt)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
