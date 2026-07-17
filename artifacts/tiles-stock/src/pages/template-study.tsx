import * as React from "react"
import { useState } from "react"
import * as XLSX from "xlsx"
import {
  FileSpreadsheet, Download, Building2, ImageOff,
  Ruler, Palette, ChevronDown, Info, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"
import { useListDepots, useListStock, type StockItem } from "@workspace/api-client-react"

/* ─── depot selector ────────────────────────────────────────────── */
function DepotSelect({ value, onChange, depots }: {
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
        <option value="">— Select a Depot —</option>
        {depots.map((d) => (
          <option key={d.id} value={d.id}>{d.name}{d.location ? ` (${d.location})` : ""}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    </div>
  )
}

/* ─── thumbnail ─────────────────────────────────────────────────── */
function TileThumb({ id, name }: { id: number; name: string }) {
  const [s, setS] = useState<"loading" | "ok" | "error">("loading")
  return (
    <div className="w-12 h-12 rounded border border-[#b7c4b7] bg-[#f0f4f0] shrink-0 flex items-center justify-center overflow-hidden">
      {s === "error" ? <ImageOff className="h-4 w-4 text-[#9aab9a]" /> : (
        <img src={`/api/stock/${id}/image`} alt={name}
          className={`w-full h-full object-cover transition-opacity ${s === "ok" ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setS("ok")} onError={() => setS("error")} />
      )}
    </div>
  )
}

/* ─── excel download ────────────────────────────────────────────── */
function downloadAsExcel(items: StockItem[], depotName: string) {
  const headers = ["Tile Name", "Brand", "Size", "Finish", "Boxes", "Pcs", "Stock Date", "Location"]
  const rows = [headers, ...items.map(i => [
    i.tileName,
    i.brand || "",
    i.size || "",
    i.finish || "",
    i.boxCount ?? 0,
    i.pcsCount ?? 0,
    i.stockDate || "",
    i.location || "",
  ])]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 35 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, depotName.slice(0, 31))
  XLSX.writeFile(wb, `${depotName.replace(/[^a-zA-Z0-9]/g, "_")}_stock.xlsx`)
}

/* ─── stock table ───────────────────────────────────────────────── */
function StockTable({ items, depotName, isLoading, isFetching }: {
  items: StockItem[]
  depotName: string
  isLoading: boolean
  isFetching: boolean
}) {
  if (isLoading) return (
    <div className="space-y-3 p-4">
      {Array(8).fill(0).map((_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-12 w-12 rounded shrink-0" />
          <Skeleton className="h-12 flex-1 rounded" />
        </div>
      ))}
    </div>
  )

  if (items.length === 0) return (
    <div className="py-20 flex flex-col items-center text-center gap-3 text-muted-foreground">
      <FileSpreadsheet className="h-14 w-14 opacity-20" />
      <p className="font-medium">No stock data yet</p>
      <p className="text-sm max-w-xs">Upload a PDF report for this depot to see its stock here.</p>
    </div>
  )

  const Th = ({ children, align = "left", w }: { children: React.ReactNode; align?: string; w?: string }) => (
    <th className="border border-[#a3b8a3] bg-[#217346] text-white px-3 py-2 text-xs font-bold tracking-wide whitespace-nowrap"
      style={{ textAlign: align as any, width: w }}>{children}</th>
  )

  return (
    <div className="rounded-md border border-[#a3b8a3] overflow-hidden shadow-sm">
      {/* Workbook tab bar */}
      <div className="bg-[#217346] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-white" />
          <span className="text-white text-sm font-semibold">{depotName}</span>
        </div>
        {isFetching && <Loader2 className="h-3.5 w-3.5 text-white/70 animate-spin" />}
      </div>

      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-20">
            {/* Column letters */}
            <tr className="bg-[#d0e4d0] border-b border-[#a3b8a3]">
              <th className="border border-[#a3b8a3] px-2 py-1 text-center text-[10px] font-bold text-[#3a5a3a] w-10">#</th>
              {["A","B","C","D","E","F","G"].map(l => (
                <th key={l} className="border border-[#a3b8a3] px-2 py-1 text-center text-[10px] font-bold text-[#3a5a3a]">{l}</th>
              ))}
            </tr>
            {/* Column headers */}
            <tr>
              <th className="border border-[#a3b8a3] bg-[#c6d9c6] px-2 py-2 text-center text-[10px] font-bold text-[#3a5a3a] w-10">Row</th>
              <Th w="80px">Photo</Th>
              <Th>Tile Name</Th>
              <Th>Brand</Th>
              <Th>Size &amp; Finish</Th>
              <Th align="right">Stock</Th>
              <Th>Date / Location</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const even = idx % 2 === 0
              const bg = even ? "bg-white" : "bg-[#f2f7f2]"
              const cell = `border border-[#c8d8c8] px-3 py-2 ${bg}`
              return (
                <tr key={item.id} className={`${bg} hover:bg-[#e6f0e6] transition-colors`}>
                  {/* Row number */}
                  <td className="border border-[#c8d8c8] px-2 py-2 text-center text-[10px] font-mono text-[#6a8a6a] bg-[#f0f5f0] w-10">{idx + 1}</td>
                  {/* Photo */}
                  <td className={cell}>
                    {item.hasImage
                      ? <TileThumb id={item.id} name={item.tileName} />
                      : <div className="w-12 h-12 rounded border border-dashed border-[#b7c4b7] bg-[#f5f8f5] flex items-center justify-center"><ImageOff className="h-4 w-4 text-[#b0bdb0]" /></div>
                    }
                  </td>
                  {/* Tile name */}
                  <td className={cell}>
                    <span className="font-semibold text-foreground text-sm leading-tight">{item.tileName}</span>
                  </td>
                  {/* Brand */}
                  <td className={cell}>
                    {item.brand
                      ? <span className="inline-block border border-[#a3b8a3] bg-[#eaf3ea] text-[#2d5a2d] rounded px-2 py-0.5 text-[10px] font-semibold">{item.brand}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  {/* Size & Finish */}
                  <td className={cell}>
                    <div className="flex flex-col gap-1">
                      {item.size && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Ruler className="h-3 w-3 shrink-0" /><span className="font-mono bg-[#e8f0e8] border border-[#c8d8c8] px-1.5 rounded">{item.size}</span></div>}
                      {item.finish && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Palette className="h-3 w-3 shrink-0" />{item.finish}</div>}
                      {!item.size && !item.finish && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  {/* Stock */}
                  <td className={`${cell} text-right`}>
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
                  {/* Date / Location */}
                  <td className={cell}>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1 font-medium text-foreground text-xs"><Building2 className="h-3 w-3 text-muted-foreground shrink-0" />{item.depotName}</span>
                      {item.stockDate && <span className="text-[10px] text-muted-foreground pl-4">{formatDate(item.stockDate)}</span>}
                      {item.location && <span className="text-[10px] text-muted-foreground pl-4">{item.location}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {/* Empty trailing rows for that spreadsheet feel */}
            {Array(3).fill(0).map((_, i) => (
              <tr key={`e${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#f2f7f2]"}>
                <td className="border border-[#c8d8c8] px-2 py-2 text-center text-[10px] font-mono text-[#c0cac0] bg-[#f0f5f0] w-10">{items.length + i + 1}</td>
                {Array(7).fill(0).map((_, j) => <td key={j} className="border border-[#c8d8c8] px-3 py-4" />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="bg-[#e8f0e8] border-t border-[#a3b8a3] px-4 py-1.5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 bg-[#217346] rounded-sm flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">S</span>
          </div>
          <span className="text-[11px] font-semibold text-[#2d5a2d]">{depotName.slice(0, 31)}</span>
        </div>
        <span className="text-[10px] text-[#6a8a6a] ml-auto">{items.length} rows · 7 columns</span>
      </div>
    </div>
  )
}

/* ─── main page ─────────────────────────────────────────────────── */
export default function TemplateStudy() {
  const params = new URLSearchParams(window.location.search)
  const initDepot = params.get("depotId") ? Number(params.get("depotId")) : null

  const [selectedDepot, setSelectedDepot] = useState<number | null>(initDepot)

  const { data: depots, isLoading: loadingDepots } = useListDepots()
  const { data: stockPage, isLoading: loadingStock, isFetching } = useListStock({
    depotId: selectedDepot ?? undefined,
    page: 1,
    limit: 500,
  })

  const items = stockPage?.items ?? []
  const depotInfo = depots?.find(d => d.id === selectedDepot)
  const depotLabel = depotInfo?.name ?? "Select a Depot"

  React.useEffect(() => {
    const p = new URLSearchParams()
    if (selectedDepot) p.set("depotId", selectedDepot.toString())
    const qs = p.toString()
    const base = import.meta.env.BASE_URL.replace(/\/$/, "")
    window.history.replaceState(null, "", base + (qs ? `/template-study?${qs}` : "/template-study"))
  }, [selectedDepot])

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="h-7 w-7 text-[#217346]" />
          Template Study
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          View the AI-extracted stock data for each depot in spreadsheet format.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {loadingDepots ? <Skeleton className="h-9 w-52" /> : (
          <DepotSelect value={selectedDepot} onChange={setSelectedDepot} depots={depots ?? []} />
        )}
        {selectedDepot && !loadingStock && items.length > 0 && (
          <>
            <Badge variant="secondary" className="text-xs">{items.length.toLocaleString()} items</Badge>
            <Button variant="outline" size="sm"
              className="gap-2 border-[#217346] text-[#217346] hover:bg-[#217346]/10 ml-auto"
              onClick={() => downloadAsExcel(items, depotLabel)}>
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          </>
        )}
        {selectedDepot && !loadingStock && items.length === 0 && (
          <Badge variant="outline" className="text-xs text-muted-foreground">No data yet</Badge>
        )}
      </div>

      {!selectedDepot ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-20 flex flex-col items-center text-center gap-3 text-muted-foreground">
          <FileSpreadsheet className="h-14 w-14 opacity-20" />
          <p className="font-medium">Select a depot above to begin</p>
          <p className="text-sm max-w-xs">Choose a depot to view its AI-extracted stock data.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-[#217346]/30 bg-[#217346]/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 text-[#217346] shrink-0" />
            This shows what was extracted by AI from the last PDF upload for this depot.
            Upload a new PDF from the dashboard to refresh.
          </div>
          <StockTable
            items={items}
            depotName={depotLabel}
            isLoading={loadingStock}
            isFetching={isFetching}
          />
        </div>
      )}
    </div>
  )
}
