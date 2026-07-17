import * as React from "react"
import { useState } from "react"
import { Link, useLocation } from "wouter"
import { 
  Building2, 
  Package, 
  ArrowRight,
  Clock,
  Search,
  FileSpreadsheet,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"

import { useListDepots, useGetStockSummary } from "@workspace/api-client-react"

export default function Dashboard() {
  const [, navigate] = useLocation()
  const [searchValue, setSearchValue] = useState("")

  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const { data: summary, isLoading: isLoadingSummary } = useGetStockSummary()

  const isLoading = isLoadingDepots || isLoadingSummary

  const totalDepots = depots?.length || 0
  const totalUniqueTiles = summary?.reduce((acc, curr) => acc + curr.totalItems, 0) || 0

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchValue.trim()) {
      navigate(`/stock?search=${encodeURIComponent(searchValue.trim())}`)
    } else {
      navigate("/stock")
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Overview of your current stock operations.
          </p>
        </div>

        {/* Quick Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Quick search stock…"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button type="submit" size="sm" className="h-10 gap-1.5 shrink-0">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </form>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Depots</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold">{totalDepots}</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tile Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold">{totalUniqueTiles.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Depots List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold tracking-tight">Depot Status</h2>
          <div className="hidden md:flex items-center gap-2">
            <Link href="/template-study">
              <Button variant="outline" size="sm" className="gap-1.5 border-[#217346] text-[#217346] hover:bg-[#217346]/10">
                <FileSpreadsheet className="h-4 w-4" />
                Study Templates
              </Button>
            </Link>
            <Link href="/depots">
              <Button variant="outline" size="sm">
                View All Depots
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : depots?.length === 0 ? (
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-1">No depots found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You haven't added any depots yet. Add a depot to start managing stock.
              </p>
              <Link href="/depots">
                <Button>Create Depot</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summary?.map((depotSum) => {
              const depotInfo = depots?.find(d => d.id === depotSum.depotId)
              return (
                <Card key={depotSum.depotId} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-bold">{depotSum.depotName}</CardTitle>
                      <Badge variant="outline" className="bg-background">
                        {depotInfo?.location || "No Location"}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1 mt-1 text-xs">
                      <Clock className="h-3 w-3" />
                      Updated: {formatDate(depotSum.lastUploadAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 pb-4">
                    <div className="mt-2 mb-4">
                      <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Tile Items</div>
                      <div className="text-2xl font-bold text-foreground">{depotSum.totalItems.toLocaleString()}</div>
                    </div>
                    
                    <div className="mt-auto flex flex-col gap-2">
                      <Link href={`/stock?depotId=${depotSum.depotId}`} className="w-full">
                        <Button variant="secondary" className="w-full justify-between group">
                          View Stock
                          <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                      <Link href={`/template-study?depotId=${depotSum.depotId}`} className="w-full">
                        <Button
                          variant="outline"
                          className="w-full justify-between gap-1.5 border-[#217346]/50 text-[#217346] hover:bg-[#217346]/10 group"
                        >
                          <span className="flex items-center gap-1.5">
                            <FileSpreadsheet className="h-4 w-4" />
                            Study Template
                          </span>
                          <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
