import * as React from "react"
import { Link } from "wouter"
import { 
  Building2, 
  Package, 
  Boxes, 
  ArrowRight,
  TrendingUp,
  Clock
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"

import { useListDepots, useGetStockSummary } from "@workspace/api-client-react"

export default function Dashboard() {
  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const { data: summary, isLoading: isLoadingSummary } = useGetStockSummary()

  const isLoading = isLoadingDepots || isLoadingSummary

  // Calculate quick stats
  const totalDepots = depots?.length || 0
  const totalUniqueTiles = summary?.reduce((acc, curr) => acc + curr.totalItems, 0) || 0
  const totalBoxes = summary?.reduce((acc, curr) => acc + curr.totalBoxes, 0) || 0

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overview of your current stock operations.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
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
            <CardTitle className="text-sm font-medium">Total Unique Tiles</CardTitle>
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
        
        <Card className="border-l-4 border-l-emerald-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Boxes in Stock</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold">{totalBoxes.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Depots List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold tracking-tight">Depot Status</h2>
          <Link href="/depots">
            <Button variant="outline" size="sm" className="hidden md:flex">
              View All Depots
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
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
                    <div className="grid grid-cols-2 gap-4 mt-2 mb-6">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Unique Items</div>
                        <div className="text-2xl font-bold text-foreground">{depotSum.totalItems.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Total Boxes</div>
                        <div className="text-2xl font-bold text-foreground">{depotSum.totalBoxes.toLocaleString()}</div>
                      </div>
                    </div>
                    
                    <div className="mt-auto">
                      <Link href={`/stock?depotId=${depotSum.depotId}`} className="w-full">
                        <Button variant="secondary" className="w-full justify-between group">
                          View Stock
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
