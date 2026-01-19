"use client"

import { useState, useEffect } from "react"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { FinanceSummaryCards, AccountCard, TransactionList } from "@/components/finance"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Loader2, RefreshCw } from "lucide-react"
import type { FinanceAccount, FinanceTransaction, FinanceSummary } from "@/lib/types"

export default function FinancePage() {
  const user = useUser()
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [summaryRes, accountsRes, transactionsRes] = await Promise.all([
        fetch("/api/finance/summary"),
        fetch("/api/finance/accounts"),
        fetch("/api/finance/transactions?limit=50"),
      ])

      if (!summaryRes.ok || !accountsRes.ok || !transactionsRes.ok) {
        throw new Error("Failed to fetch finance data")
      }

      const [summaryData, accountsData, transactionsData] = await Promise.all([
        summaryRes.json(),
        accountsRes.json(),
        transactionsRes.json(),
      ])

      setSummary(summaryData.data)
      setAccounts(accountsData.data || [])
      setTransactions(transactionsData.data || [])
    } catch (err) {
      console.error("Failed to fetch finance data:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Finance Manager</h1>
                <p className="text-muted-foreground">Track income, expenses, and financial goals</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchData}
                  disabled={isLoading}
                  className="border-white/10 hover:bg-white/5"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button className="bg-green-500 hover:bg-green-600 text-white gap-2">
                  <Plus className="h-4 w-4" />
                  Add Transaction
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          {error ? (
            <Card className="border-white/10 bg-black/40">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button onClick={fetchData} variant="outline">
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <FinanceSummaryCards summary={summary} isLoading={isLoading} />

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-black/40 border-white/10">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="budgets">Budgets</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Accounts Overview */}
                    <Card className="border-white/10 bg-black/40">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-white">Accounts</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setActiveTab("accounts")}>
                          View All
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {isLoading ? (
                          <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
                            ))}
                          </div>
                        ) : accounts.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <p>No accounts yet. Add your first account to get started!</p>
                            <Button className="mt-4" variant="outline">
                              <Plus className="h-4 w-4 mr-2" />
                              Add Account
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {accounts.slice(0, 4).map((account) => (
                              <AccountCard key={account.id} account={account} />
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Recent Transactions */}
                    <TransactionList
                      transactions={transactions.slice(0, 10)}
                      isLoading={isLoading}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="accounts" className="mt-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {isLoading ? (
                      [1, 2, 3, 4, 5, 6].map((i) => (
                        <Card key={i} className="border-white/10 bg-black/40 h-32 animate-pulse" />
                      ))
                    ) : accounts.length === 0 ? (
                      <Card className="border-white/10 bg-black/40 col-span-full">
                        <CardContent className="pt-6">
                          <div className="text-center py-12 text-gray-400">
                            <p className="mb-4">No accounts yet. Add your first account!</p>
                            <Button className="bg-green-500 hover:bg-green-600">
                              <Plus className="h-4 w-4 mr-2" />
                              Add Account
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      accounts.map((account) => (
                        <AccountCard key={account.id} account={account} />
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="transactions" className="mt-6">
                  <TransactionList
                    transactions={transactions}
                    isLoading={isLoading}
                  />
                </TabsContent>

                <TabsContent value="budgets" className="mt-6">
                  <Card className="border-white/10 bg-black/40">
                    <CardContent className="pt-6">
                      <div className="text-center py-12 text-gray-400">
                        <p className="mb-4">Budget tracking coming soon!</p>
                        <p className="text-sm">Set spending limits and track your progress.</p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
