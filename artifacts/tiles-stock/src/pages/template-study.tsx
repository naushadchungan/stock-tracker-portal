import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import * as XLSX from "xlsx"
import {
  FileSpreadsheet,
  Download,
  Building2,
  ImageOff,
  LayoutGrid,
  Ruler,
  Palette,
  ChevronDown,
  Info,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"

import {
  useListDepots,
  useListStock,
  type StockItem,
} from "@workspace/api-client-react"

/* ─── helpers ──────────────────────────────────────────────────── */

function TileThumb({ id, name }: { id: number; name: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  return (
    <div className="w-12 h-12 rounded border border-[#b7c4b7] bg-[#f0f4f0] shrink-0 flex items-center justify-center overflow-hidden">
      {status === "error" ? (
        <ImageOff className="h-4 w-4 text-[#9aab9a]" />
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

/* ─── depot select ──────────────────────────────────────────────── */

function DepotSelect({
  value,
  onChange,
  depots,
}: {
  value: number | null
  onChange: (id: number | null) => void
  depots: { id: number; name: string; location?: string | null }[]
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="appearance-none h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring min-w-[220px]"
      >
        <option value="">— All Depots —</option>
        {depots.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}{d.location ? ` (${d.location})` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    </div>
  )
}

/* ─── excel export ──────────────────────────────────────────────── */

function exportToExcel(items: StockItem[], depotName: string) {
  const rows = items.map((item, i) => ({
    "#": i + 1,
    "Tile Name": item.tileName,
    "Design": item.design || "",
    "Brand": item.brand || "",
    "Size": item.size || "",
    "Finish": item.finish || "",
    "Boxes": item.boxCount ?? 0,
    "Pcs": item.pcsCount ?? 0,
    "Depot": item.depotName,
    "Location": item.location || "",
    "Stock Date": item.stockDate ? new Date(item.stockDate).toLocaleDateString() : "",
    "Has Photo": item.hasImage ? "Yes" : "No",
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  /* column widths */
  ws["!cols"] = [
    { wch: 5 },   // #
    { wch: 30 },  // Tile Name
    { wch: 18 },  // Design
    { wch: 18 },  // Brand
    { wch: 12 },  // Size
    { wch: 14 },  // Finish
    { wch: 8 },   // Boxes
    { wch: 6 },   // Pcs
    { wch: 18 },  // Depot
    { wch: 16 },  // Location
    { wch: 14 },  // Stock Date
    { wch: 10 },  // Has Photo
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, depotName.slice(0, 31))
  XLSX.writeFile(wb, `${depotName.replace(/[^a-zA-Z0-9]/g, "_")}_template.xlsx`)
}

/* ─── main component ────────────────────────────────────────────── */

export default function TemplateStudy() {
  const searchParams = new URLSearchParams(window.location.search)
  const initDepot = searchParams.get("depotId") ? Number(searchParams.get("depotId")) : null

  const [selectedDepot, setSelectedDepot] = useState<number | null>(initDepot)
  const { data: depots, isLoading: loadingDepots } = useListDepots()

  /* fetch all items for selected depot – large limit to get everything */
  const { data: stockPage, isLoading: loadingStock, isFetching } = useListStock({
    depotId: selectedDepot ?? undefined,
    page: 1,
    limit: 500,
  })

  const items = stockPage?.items ?? []
  const selectedDepotInfo = depots?.find((d) => d.id === selectedDepot)
  const depotLabel = selectedDepotInfo?.name ?? "All Depots"

  /* sync URL */
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedDepot) params.set("depotId", selectedDepot.toString())
    const qs = params.toString()
    const newPath = qs ? `/template-study?${qs}` : "/template-study"
    window.history.replaceState(null, "", import.meta.env.BASE_URL.replace(/\/$/, "") + newPath)
  }, [selectedDepot])

  const handleExport = useCallback(() => {
    exportToExcel(items, depotLabel)
  }, [items, depotLabel])

  const isLoading = loadingDepots || loadingStock

  /* ── column header cell ── */
  const Th = ({ children, align = "left", w }: { children: React.ReactNode; align?: string; w?: string }) => (
    <th
      className="border border-[#a3b8a3] bg-[#217346] text-white px-3 py-2 text-xs font-bold tracking-wide whitespace-nowrap"
      style={{ textAlign: align as any, width: w }}
    >
      {children}
    </th>
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="h-7 w-7 text-[#217346]" />
          Template Study
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review the extracted data template for each depot — exactly as it appears in the stock report.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {loadingDepots ? (
          <Skeleton className="h-9 w-52" />
        ) : (
          <DepotSelect
            value={selectedDepot}
            onChange={setSelectedDepot}
            depots={depots ?? []}
          />
        )}

        {items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-[#217346] text-[#217346] hover:bg-[#217346]/10"
            onClick={handleExport}
            disabled={isFetching}
          >
            <Download className="h-4 w-4" />
            Download Excel
          </Button>
        )}

        {items.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {items.length.toLocaleString()} items
          </Badge>
        )}

        {isFetching && !loadingStock && (
          <Badge variant="outline" className="text-xs animate-pulse border-primary/30 text-primary">
            Refreshing…
          </Badge>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-md border border-[#217346]/30 bg-[#217346]/5 px-4 py-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 text-[#217346] shrink-0" />
        <span>
          This table mirrors the columns in the exported Excel template. Select a depot above to study its data layout, then download as <strong>.xlsx</strong> for offline review.
        </span>
      </div>

      {/* Spreadsheet table */}
      <div className="rounded-md border border-[#a3b8a3] overflow-hidden shadow-sm">
        {/* Excel-style title bar */}
        <div className="bg-[#217346] px-4 py-2 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-white" />
          <span className="text-white text-sm font-semibold tracking-wide">
            {depotLabel} — Stock Template
          </span>
        </div>

        <div className="overflow-auto max-h-[65vh]">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array(10).fill(0).map((_, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-12 w-12 rounded shrink-0" />
                  <Skeleton className="h-12 flex-1 rounded" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 flex flex-col items-center text-center gap-3 text-muted-foreground">
              <FileSpreadsheet className="h-14 w-14 opacity-20" />
              <p className="font-medium">No stock data found</p>
              <p className="text-sm max-w-xs">
                {selectedDepot
                  ? "This depot has no stock items yet. Upload a PDF report to populate the template."
                  : "Select a depot above to study its template."}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse min-w-[900px]">
              {/* Excel-style column header */}
              <thead className="sticky top-0 z-20">
                {/* Row-number spacer row (Excel A/B/C column letters) */}
                <tr className="bg-[#e8f0e8] border-b border-[#a3b8a3]">
                  <th className="border border-[#a3b8a3] bg-[#d0e4d0] px-2 py-1 text-center text-[10px] font-bold text-[#3a5a3a] w-10">#</th>
                  {["A","B","C","D","E","F","G"].map((l) => (
                    <th key={l} className="border border-[#a3b8a3] bg-[#d0e4d0] px-2 py-1 text-center text-[10px] font-bold text-[#3a5a3a]">{l}</th>
                  ))}
                </tr>
                {/* Column names row */}
                <tr>
                  <th className="border border-[#a3b8a3] bg-[#c6d9c6] px-2 py-2 text-center text-[10px] font-bold text-[#3a5a3a] w-10">Row</th>
                  <Th w="80px">Photo</Th>
                  <Th>Tile Details</Th>
                  <Th>Brand</Th>
                  <Th>Size &amp; Finish</Th>
                  <Th align="right">Stock</Th>
                  <Th>Location</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isEven = idx % 2 === 0
                  const rowBg = isEven ? "bg-white" : "bg-[#f2f7f2]"
                  const cellCls = `border border-[#c8d8c8] px-3 py-2 ${rowBg}`

                  return (
                    <tr key={item.id} className={`${rowBg} hover:bg-[#e6f0e6] transition-colors`}>
                      {/* Row number */}
                      <td className={`border border-[#c8d8c8] px-2 py-2 text-center text-[10px] font-mono text-[#6a8a6a] bg-[#f0f5f0] w-10`}>
                        {idx + 1}
                      </td>

                      {/* A — Photo */}
                      <td className={cellCls}>
                        {item.hasImage ? (
                          <TileThumb id={item.id} name={item.tileName} />
                        ) : (
                          <div className="w-12 h-12 rounded border border-dashed border-[#b7c4b7] bg-[#f5f8f5] flex items-center justify-center">
                            <ImageOff className="h-4 w-4 text-[#b0bdb0]" />
                          </div>
                        )}
                      </td>

                      {/* B — Tile Details */}
                      <td className={cellCls}>
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-sm leading-tight">{item.tileName}</span>
                          {item.design && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <LayoutGrid className="h-2.5 w-2.5" />
                              {item.design}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* C — Brand */}
                      <td className={cellCls}>
                        {item.brand ? (
                          <span className="inline-block border border-[#a3b8a3] bg-[#eaf3ea] text-[#2d5a2d] rounded px-2 py-0.5 text-[10px] font-semibold">
                            {item.brand}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* D — Size & Finish */}
                      <td className={cellCls}>
                        <div className="flex flex-col gap-1">
                          {item.size && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Ruler className="h-3 w-3 shrink-0" />
                              <span className="font-mono bg-[#e8f0e8] border border-[#c8d8c8] px-1.5 rounded">{item.size}</span>
                            </div>
                          )}
                          {item.finish && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Palette className="h-3 w-3 shrink-0" />
                              {item.finish}
                            </div>
                          )}
                          {!item.size && !item.finish && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>

                      {/* E — Stock */}
                      <td className={`${cellCls} text-right`}>
                        <div className="flex flex-col items-end">
                          <div className="inline-flex items-baseline gap-0.5">
                            <span className="text-base font-bold text-[#217346]">{item.boxCount ?? 0}</span>
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase ml-0.5">Box</span>
                          </div>
                          {item.pcsCount != null && Number(item.pcsCount) > 0 && (
                            <span className="text-[10px] text-muted-foreground">+ {item.pcsCount} pcs</span>
                          )}
                        </div>
                      </td>

                      {/* F — Location */}
                      <td className={cellCls}>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 font-medium text-foreground text-xs">
                            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            {item.depotName}
                          </span>
                          {item.stockDate && (
                            <span className="text-[10px] text-muted-foreground pl-4">{formatDate(item.stockDate)}</span>
                          )}
                          {item.location && (
                            <span className="text-[10px] text-muted-foreground pl-4">{item.location}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {/* Excel-style empty rows below data */}
                {Array(3).fill(0).map((_, i) => (
                  <tr key={`empty-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#f2f7f2]"}>
                    <td className="border border-[#c8d8c8] px-2 py-2 text-center text-[10px] font-mono text-[#c0cac0] bg-[#f0f5f0] w-10">{items.length + i + 1}</td>
                    {Array(7).fill(0).map((_, j) => (
                      <td key={j} className="border border-[#c8d8c8] px-3 py-4" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer bar — like Excel's sheet tab bar */}
        {items.length > 0 && (
          <div className="bg-[#e8f0e8] border-t border-[#a3b8a3] px-4 py-1.5 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-4 w-4 bg-[#217346] rounded-sm flex items-center justify-center">
                <span className="text-white text-[8px] font-bold">S</span>
              </div>
              <span className="text-[11px] font-semibold text-[#2d5a2d]">{depotLabel.slice(0, 31)}</span>
            </div>
            <span className="text-[10px] text-[#6a8a6a] ml-auto">
              {items.length} rows · {Object.keys({"#":1,Photo:1,"Tile Details":1,Brand:1,"Size & Finish":1,Stock:1,Location:1}).length} columns
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
