"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  MoreVertical,
  Search,
  Filter
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FinanceTransaction } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { useState } from "react"

interface TransactionListProps {
  transactions: FinanceTransaction[]
  isLoading?: boolean
  onEdit?: (transaction: FinanceTransaction) => void
  onDelete?: (id: string) => void
}

export function TransactionList({ transactions, isLoading, onEdit, onDelete }: TransactionListProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredTransactions = transactions.filter((t) =>
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.merchant?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.categoryName?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <Card className="border-white/10 bg-black/40">
        <CardHeader>
          <CardTitle className="text-white">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-white/10" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-white/10 rounded mb-2" />
                  <div className="h-3 w-24 bg-white/10 rounded" />
                </div>
                <div className="h-4 w-20 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-white/10 bg-black/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">Recent Transactions</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search..."
              className="pl-9 w-48 bg-black/40 border-white/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No transactions found</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {filteredTransactions.map((transaction) => (
                <TransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function TransactionItem({
  transaction,
  onEdit,
  onDelete
}: {
  transaction: FinanceTransaction
  onEdit?: (transaction: FinanceTransaction) => void
  onDelete?: (id: string) => void
}) {
  const isIncome = transaction.transactionType === "income"
  const isTransfer = transaction.transactionType === "transfer"
  const Icon = isTransfer ? ArrowLeftRight : isIncome ? ArrowDownLeft : ArrowUpRight

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors group">
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full",
        isIncome ? "bg-green-500/20" : isTransfer ? "bg-blue-500/20" : "bg-red-500/20"
      )}>
        <Icon className={cn(
          "h-5 w-5",
          isIncome ? "text-green-400" : isTransfer ? "text-blue-400" : "text-red-400"
        )} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">
            {transaction.merchant || transaction.description || "Untitled"}
          </p>
          {transaction.isPending && (
            <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-400">
              Pending
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{formatDate(transaction.transactionDate)}</span>
          {transaction.categoryName && (
            <>
              <span>•</span>
              <span>{transaction.categoryName}</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right">
        <p className={cn(
          "text-sm font-medium",
          isIncome ? "text-green-400" : isTransfer ? "text-blue-400" : "text-red-400"
        )}>
          {isIncome ? "+" : isTransfer ? "" : "-"}{formatCurrency(Math.abs(transaction.amount))}
        </p>
        {transaction.accountName && (
          <p className="text-xs text-gray-500">{transaction.accountName}</p>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onEdit?.(transaction)}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
    </div>
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

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return "Today"
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday"
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
