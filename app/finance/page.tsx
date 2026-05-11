"use client"

import { useState, useEffect } from "react"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { FinanceSummaryCards, AccountCard, TransactionList } from "@/components/finance"
import type { FinanceAccount, FinanceTransaction, FinanceSummary } from "@/lib/types"

const TABS = ["overview", "accounts", "transactions", "budgets"] as const
type Tab = typeof TABS[number]

export default function FinancePage() {
  const user = useUser()
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  useEffect(() => {
    if (user) fetchData()
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
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* Action strip */}
        <div className="j-row j-between">
          <div className="j-row j-gap-2">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`j-pill ${activeTab === t ? "j-proj" : "j-ghost"}`}
                style={{ cursor: "pointer", border: "none", textTransform: "capitalize" }}
              >
                {t === "accounts" ? `Accounts (${accounts.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="j-row j-gap-2">
            <button className="j-btn j-btn-ghost" onClick={fetchData} disabled={isLoading}>↻ Refresh</button>
            <button className="j-btn j-btn-primary">+ Add transaction</button>
          </div>
        </div>

        {error && (
          <div className="j-card" style={{ textAlign: "center", padding: 32 }}>
            <p style={{ color: "var(--j-neg)", marginBottom: 12 }}>{error}</p>
            <button className="j-btn j-btn-ghost" onClick={fetchData}>Try again</button>
          </div>
        )}

        {!error && (
          <>
            {/* Summary cards */}
            <FinanceSummaryCards summary={summary} isLoading={isLoading} />

            {/* Overview tab */}
            {activeTab === "overview" && (
              <div className="j-split">
                {/* Accounts overview */}
                <div className="j-card">
                  <div className="j-card-head">
                    <p className="j-card-title">Accounts</p>
                    <button className="j-btn j-btn-ghost" style={{ fontSize: 12 }} onClick={() => setActiveTab("accounts")}>View all</button>
                  </div>
                  {isLoading ? (
                    <div className="j-col j-gap-2">
                      {[1,2,3].map(i => <div key={i} style={{ height: 64, background: "oklch(1 0 0 / 0.04)", borderRadius: 8 }} />)}
                    </div>
                  ) : accounts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32 }}>
                      <p className="j-muted" style={{ marginBottom: 12 }}>No accounts yet.</p>
                      <button className="j-btn j-btn-primary">+ Add account</button>
                    </div>
                  ) : (
                    <div className="j-col j-gap-2">
                      {accounts.slice(0, 4).map(a => <AccountCard key={a.id} account={a} />)}
                    </div>
                  )}
                </div>

                {/* Recent transactions */}
                <TransactionList transactions={transactions.slice(0, 10)} isLoading={isLoading} />
              </div>
            )}

            {/* Accounts tab */}
            {activeTab === "accounts" && (
              <div className="j-grid j-cols-3">
                {isLoading ? (
                  [1,2,3,4,5,6].map(i => <div key={i} className="j-card" style={{ height: 128 }} />)
                ) : accounts.length === 0 ? (
                  <div className="j-card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 48 }}>
                    <p className="j-muted" style={{ marginBottom: 12 }}>No accounts yet.</p>
                    <button className="j-btn j-btn-primary">+ Add account</button>
                  </div>
                ) : (
                  accounts.map(a => <AccountCard key={a.id} account={a} />)
                )}
              </div>
            )}

            {/* Transactions tab */}
            {activeTab === "transactions" && (
              <TransactionList transactions={transactions} isLoading={isLoading} />
            )}

            {/* Budgets tab */}
            {activeTab === "budgets" && (
              <div className="j-coming-soon">
                <span style={{ fontSize: 32 }}>💰</span>
                <span className="j-eyebrow" style={{ color: "var(--j-accent)" }}>Coming soon</span>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Budget tracking</h2>
                <p className="j-muted" style={{ fontSize: 14, margin: 0 }}>Set spending limits and track your progress.</p>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
