import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { useLocation } from "wouter"
import { 
  Search, 
  Filter, 
  Package, 
  Building2, 
  Ruler, 
  Palette, 
  X,
  Clock,
  LayoutGrid
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { SearchInput } from "@/components/ui/search-input"
import { Pagination } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"

import { 
  useListStock, 
  useListDepots, 
  useGetStockFilters,
  type ListStockParams
} from "@workspace/api-client-react"

// Hooks to keep URL search params in sync with state
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function StockSearch() {
  const [_, setLocation] = useLocation()
  
  // Extract initial values from URL
  const searchParams = new URLSearchParams(window.location.search)
  const initialDepotId = searchParams.get('depotId') ? Number(searchParams.get('depotId')) : null
  const initialSearch = searchParams.get('search') || ""
  
  // Local filter states
  const [searchTerm, setSearchTerm] = useState(initialSearch)
  const debouncedSearch = useDebounce(searchTerm, 400)
  
  const [filters, setFilters] = useState({
    depotId: initialDepotId,
    brand: "",
    size: "",
    finish: ""
  })
  
  const [page, setPage] = useState(1)
  const limit = 20

  // Queries
  const { data: depots } = useListDepots()
  const { data: availableFilters } = useGetStockFilters({ depotId: filters.depotId })
  
  const queryParams: ListStockParams = {
    page,
    limit,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(filters.depotId ? { depotId: filters.depotId } : {}),
    ...(filters.brand ? { brand: filters.brand } : {}),
    ...(filters.size ? { size: filters.size } : {}),
    ...(filters.finish ? { finish: filters.finish } : {}),
  }
  
  const { data: stockPage, isLoading: isSearching, isFetching } = useListStock(queryParams)

  // Update URL when filters change (for shareability)
  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.depotId) params.set('depotId', filters.depotId.toString())
    if (debouncedSearch) params.set('search', debouncedSearch)
    
    // We only put primary filters in URL to not clutter it too much
    const newSearch = params.toString()
    const newPath = newSearch ? `/stock?${newSearch}` : '/stock'
    
    if (window.location.pathname + window.location.search !== newPath) {
      // Use history replaceState to not create infinite back history
      window.history.replaceState(null, '', import.meta.env.BASE_URL.replace(/\/$/, '') + newPath)
    }
  }, [filters.depotId, debouncedSearch])

  // Handlers
  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1) // Reset to page 1 on filter change
  }

  const clearFilters = () => {
    setSearchTerm("")
    setFilters({
      depotId: null,
      brand: "",
      size: "",
      finish: ""
    })
    setPage(1)
  }

  const hasActiveFilters = Boolean(
    searchTerm || filters.depotId || filters.brand || filters.size || filters.finish
  )

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Search</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search inventory across all depots.
          </p>
        </div>
      </div>

      <Card className="shrink-0 rounded-md border-border/60 bg-card/50 shadow-sm">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput 
              placeholder="Search by tile name, design, or brand..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              className="h-10 text-base"
            />
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                onClick={clearFilters}
                className="shrink-0 h-10 px-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select
              value={filters.depotId?.toString() || ""}
              onChange={(e) => handleFilterChange('depotId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All Depots</option>
              {depots?.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>

            <Select
              value={filters.brand}
              onChange={(e) => handleFilterChange('brand', e.target.value)}
              disabled={!availableFilters?.brands?.length}
            >
              <option value="">All Brands</option>
              {availableFilters?.brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>

            <Select
              value={filters.size}
              onChange={(e) => handleFilterChange('size', e.target.value)}
              disabled={!availableFilters?.sizes?.length}
            >
              <option value="">All Sizes</option>
              {availableFilters?.sizes.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>

            <Select
              value={filters.finish}
              onChange={(e) => handleFilterChange('finish', e.target.value)}
              disabled={!availableFilters?.finishes?.length}
            >
              <option value="">All Finishes</option>
              {availableFilters?.finishes.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <div className="flex-1 border rounded-md bg-card overflow-hidden flex flex-col relative min-h-[400px]">
        {/* Loading overlay for subsequent fetches */}
        {isFetching && !isSearching && (
          <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center">
            <Badge variant="outline" className="bg-background shadow-md border-primary/20 text-primary animate-pulse py-1.5 px-3 text-sm">
              Updating results...
            </Badge>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {isSearching ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center space-x-4 mb-4">
                <Skeleton className="h-8 w-[250px]" />
              </div>
              {Array(10).fill(0).map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : stockPage?.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No items found</h3>
              <p className="text-muted-foreground text-sm max-w-sm mb-4">
                We couldn't find any stock matching your current filters. Try adjusting your search criteria or changing depots.
              </p>
              <Button variant="outline" onClick={clearFilters}>
                Clear All Filters
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm text-left relative">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0 z-20 backdrop-blur-sm shadow-sm font-semibold tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tile Details</th>
                  <th className="px-4 py-3 font-semibold w-[15%]">Brand</th>
                  <th className="px-4 py-3 font-semibold w-[15%]">Size & Finish</th>
                  <th className="px-4 py-3 font-semibold text-right w-[10%]">Stock</th>
                  <th className="px-4 py-3 font-semibold w-[20%]">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {stockPage?.items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex flex-col">
                        <span className="text-base font-bold tracking-tight">{item.tileName}</span>
                        {item.design && (
                          <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <LayoutGrid className="h-3 w-3" /> {item.design}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.brand ? (
                        <Badge variant="outline" className="font-normal text-xs">{item.brand}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {item.size && (
                          <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                            <Ruler className="h-3.5 w-3.5" />
                            <span className="font-mono bg-muted px-1.5 rounded">{item.size}</span>
                          </div>
                        )}
                        {item.finish && (
                          <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                            <Palette className="h-3.5 w-3.5" />
                            {item.finish}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <div className="inline-flex items-baseline gap-1">
                          <span className="text-lg font-bold text-primary">{item.boxCount || 0}</span>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Box</span>
                        </div>
                        {item.pcsCount !== null && item.pcsCount !== undefined && item.pcsCount > 0 && (
                          <span className="text-xs text-muted-foreground mt-0.5">
                            + {item.pcsCount} pcs
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.depotName}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Last Stock Date">
                          <Clock className="h-3 w-3" />
                          {item.stockDate ? formatDate(item.stockDate) : 'Unknown Date'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {stockPage && stockPage.totalPages > 0 && (
          <div className="border-t bg-card p-3 shrink-0 flex items-center justify-between">
            <div className="text-sm text-muted-foreground hidden sm:block">
              Showing <span className="font-medium text-foreground">{(page - 1) * limit + 1}</span> to <span className="font-medium text-foreground">{Math.min(page * limit, stockPage.total)}</span> of <span className="font-medium text-foreground">{stockPage.total}</span> items
            </div>
            <div className="w-full sm:w-auto">
              <Pagination 
                page={page} 
                totalPages={stockPage.totalPages} 
                onPageChange={setPage} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
