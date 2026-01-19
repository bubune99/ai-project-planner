"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FinanceSummary } from "@/lib/types"

interface FinanceSummaryCardsProps {
  summary: FinanceSummary | null
  isLoading?: boolean
}

export function FinanceSummaryCards({ summary, isLoading }: FinanceSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-white/10 bg-black/40 animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-8 w-8 bg-white/10 rounded-full" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-white/10 rounded mb-2" />
              <div className="h-3 w-20 bg-white/10 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!summary) {
    return null
  }

  const cards = [
    {
      title: "Net Worth",
      value: summary.netWorth.total,
      change: summary.netWorth.change,
      changePercent: summary.netWorth.changePercent,
      icon: Wallet,
      color: "blue",
    },
    {
      title: "Monthly Income",
      value: summary.income.total,
      change: null,
      changePercent: null,
      icon: TrendingUp,
      color: "green",
    },
    {
      title: "Monthly Expenses",
      value: summary.expenses.total,
      change: null,
      changePercent: null,
      icon: CreditCard,
      color: "red",
    },
    {
      title: "Savings Rate",
      value: summary.income.total > 0
        ? ((summary.income.total - summary.expenses.total) / summary.income.total) * 100
        : 0,
      change: null,
      changePercent: null,
      icon: PiggyBank,
      color: "purple",
      isPercentage: true,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-white/10 bg-black/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              {card.title}
            </CardTitle>
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              card.color === "blue" && "bg-blue-500/20",
              card.color === "green" && "bg-green-500/20",
              card.color === "red" && "bg-red-500/20",
              card.color === "purple" && "bg-purple-500/20",
            )}>
              <card.icon className={cn(
                "h-4 w-4",
                card.color === "blue" && "text-blue-400",
                card.color === "green" && "text-green-400",
                card.color === "red" && "text-red-400",
                card.color === "purple" && "text-purple-400",
              )} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {card.isPercentage
                ? `${card.value.toFixed(1)}%`
                : formatCurrency(card.value)
              }
            </div>
            {card.change !== null && card.changePercent !== null && (
              <p className={cn(
                "text-xs flex items-center gap-1",
                card.change >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {card.change >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {card.change >= 0 ? "+" : ""}{formatCurrency(card.change)} ({card.changePercent.toFixed(1)}%)
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
