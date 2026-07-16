import * as React from "react"
import { useState, useEffect } from "react"
import { 
  Search, 
  Package, 
  Building2, 
  Ruler, 
  Palette, 
  X,
  Clock,
  LayoutGrid,
  ImageOff
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function TileImage({ id, name }: { id: number; name: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  return (
    <div className="w-14 h-14 rounded overflow-hidden border border-border bg-muted shrink-0 flex items-center justify-center">
      {status === "error" ? (
        <ImageOff className="h-5 w-5 text-muted-foreground/40" />
      ) : (
        <img
          src={`/api/stock/${id}/image`}
          alt={name}
          className={`w-full h-full object-cover transition-opacity ${status === "ok" ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  )
}

export default function StockSearch() {
  const searchParams = new URLSearchParams(window.location.search)
  const initialDepotId = searchParams.get('depotId') ? Number(searchParams.get('depotId')) : null
  const initialSearch = searchParams.get('search') || ""
  
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

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.depotId) params.set('depotId', filters.depotId.toString())
    if (debouncedSearch) params.set('search', debouncedSearch)
    const newSearch = params.toString()
    const newPath = newSearch ? `/stock?${newSearch}` : '/stock'
    if (window.location.pathname + window.location.search !== newPath) {
      window.history.replaceState(null, '', import.meta.env.BASE_URL.replace(/\/$/, '') + newPath)
    }
  }, [filters.depotId, debouncedSearch])

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setSearchTerm("")
    setFilters({ depotId: null, brand: "", size: "", finish: "" })
    setPage(1)
  }

  const hasActiveFilters = Boolean(searchTerm || filters.depotId || filters.brand || filters.size || filters.finish)

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
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
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

        </div>
      </Card>

      <div className="flex-1 border rounded-md bg-card overflow-hidden flex flex-col relative min-h-[400px]">
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
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-14 w-14 rounded shrink-0" />
                  <Skeleton className="h-14 w-full rounded" />
                </div>
              ))}
            </div>
          ) : stockPage?.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No items found</h3>
              <p className="text-muted-foreground text-sm max-w-sm mb-4">
                No stock matching your current filters. Try adjusting your search or changing depots.
              </p>
              <Button variant="outline" onClick={clearFilters}>Clear All Filters</Button>
            </div>
          ) : (
            <table className="w-full text-sm text-left relative">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0 z-20 backdrop-blur-sm shadow-sm font-semibold tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-[70px]">Photo</th>
                  <th className="px-4 py-3 font-semibold">Tile Details</th>
                  <th className="px-4 py-3 font-semibold w-[14%]">Brand</th>
                  <th className="px-4 py-3 font-semibold w-[14%]">Size & Finish</th>
                  <th className="px-4 py-3 font-semibold text-right w-[10%]">Stock</th>
                  <th className="px-4 py-3 font-semibold w-[18%]">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {stockPage?.items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-3 py-2">
                      {item.hasImage ? (
                        <TileImage id={item.id} name={item.tileName} />
                      ) : (
                        <div className="w-14 h-14 rounded border border-dashed border-border bg-muted/30 flex items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                      )}
                    </td>
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
                        {item.pcsCount !== null && item.pcsCount !== undefined && Number(item.pcsCount) > 0 && (
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
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
              Showing <span className="font-medium text-foreground">{(page - 1) * limit + 1}</span> to{" "}
              <span className="font-medium text-foreground">{Math.min(page * limit, stockPage.total)}</span> of{" "}
              <span className="font-medium text-foreground">{stockPage.total}</span> items
            </div>
            <div className="w-full sm:w-auto">
              <Pagination page={page} totalPages={stockPage.totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
