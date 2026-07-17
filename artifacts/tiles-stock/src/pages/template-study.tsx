import * as React from "react"
import { useState, useCallback, useRef } from "react"
import * as XLSX from "xlsx"
import {
  FileSpreadsheet, Download, Building2, ImageOff, LayoutGrid,
  Ruler, Palette, ChevronDown, Info, Upload, CheckCircle2,
  AlertCircle, Loader2, BookOpen, GraduationCap, Trash2, Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"
import { useListDepots, useListStock, type StockItem } from "@workspace/api-client-react"

/* ─── tiny helpers ─────────────────────────────────────────────── */

function str(v: unknown) { return v != null ? String(v).trim() : "" }
function num(v: unknown) { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

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

/* ─── excel helpers ─────────────────────────────────────────────── */

const TEMPLATE_HEADERS = ["Tile Name", "Design", "Brand", "Size", "Finish", "Boxes", "Pcs", "Location"]

function downloadBlankTemplate(depotName: string) {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    // Two example rows so user sees the format
    ["STANZA GLOSSY WHITE", "", "STANZA", "600x1200", "GLOSSY", 10, 0, ""],
    ["", "", "", "", "", "", "", ""],
  ])
  ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 6 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Stock Template")
  XLSX.writeFile(wb, `${depotName.replace(/[^a-zA-Z0-9]/g, "_")}_BLANK_template.xlsx`)
}

function downloadCurrentData(items: StockItem[], depotName: string) {
  const rows = [TEMPLATE_HEADERS, ...items.map(i => [
    i.tileName, i.design || "", i.brand || "",
    i.size || "", i.finish || "",
    i.boxCount ?? 0, i.pcsCount ?? 0, i.location || "",
  ])]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 6 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, depotName.slice(0, 31))
  XLSX.writeFile(wb, `${depotName.replace(/[^a-zA-Z0-9]/g, "_")}_current.xlsx`)
}

/* parse uploaded excel into row objects */
type RowItem = { tileName: string; design: string; brand: string; size: string; finish: string; boxCount: number; pcsCount: number; location: string }

function parseExcelFile(file: File): Promise<RowItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

        if (rows.length < 2) { resolve([]); return }

        // Find header row (first row containing "Tile Name" or "tile")
        let headerIdx = 0
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const r = rows[i] as unknown[]
          if (r.some(c => String(c).toLowerCase().includes("tile"))) { headerIdx = i; break }
        }

        const headers = (rows[headerIdx] as unknown[]).map(h => String(h).toLowerCase().trim())
        const col = (names: string[]) => {
          for (const n of names) {
            const idx = headers.findIndex(h => h.includes(n))
            if (idx >= 0) return idx
          }
          return -1
        }

        const iName  = col(["tile name", "tile", "name", "item"])
        const iDes   = col(["design"])
        const iBrand = col(["brand"])
        const iSize  = col(["size"])
        const iFin   = col(["finish"])
        const iBox   = col(["box", "qty", "quantity", "stock"])
        const iPcs   = col(["pcs", "piece"])
        const iLoc   = col(["location"])

        const items: RowItem[] = []
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i] as unknown[]
          const tileName = iName >= 0 ? str(r[iName]) : ""
          if (!tileName) continue
          items.push({
            tileName,
            design:   iDes   >= 0 ? str(r[iDes])   : "",
            brand:    iBrand >= 0 ? str(r[iBrand])  : "",
            size:     iSize  >= 0 ? str(r[iSize])   : "",
            finish:   iFin   >= 0 ? str(r[iFin])    : "",
            boxCount: iBox   >= 0 ? num(r[iBox])    : 0,
            pcsCount: iPcs   >= 0 ? num(r[iPcs])    : 0,
            location: iLoc   >= 0 ? str(r[iLoc])   : "",
          })
        }
        resolve(items)
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error("File read failed"))
    reader.readAsArrayBuffer(file)
  })
}

/* ─── teach tab ─────────────────────────────────────────────────── */

function TeachTab({ depotId, depotName, currentItems }: {
  depotId: number
  depotName: string
  currentItems: StockItem[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<RowItem[] | null>(null)
  const [fileName, setFileName] = useState("")
  const [stockDate, setStockDate] = useState(new Date().toISOString().slice(0, 10))
  const [state, setState] = useState<"idle" | "parsing" | "preview" | "importing" | "done" | "error">("idle")
  const [importResult, setImportResult] = useState<{ itemCount: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setState("parsing")
    try {
      const rows = await parseExcelFile(file)
      setPreview(rows)
      setState("preview")
    } catch {
      setErrorMsg("Could not read the Excel file. Make sure it's a valid .xlsx or .xls file.")
      setState("error")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleConfirmImport = async () => {
    if (!preview || preview.length === 0) return
    setState("importing")
    try {
      const resp = await fetch("/api/stock/import-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ depotId, stockDate, items: preview }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Import failed" }))
        throw new Error(err.error || "Import failed")
      }
      const result = await resp.json()
      setImportResult(result)
      setState("done")
    } catch (err: any) {
      setErrorMsg(err.message || "Import failed")
      setState("error")
    }
  }

  const reset = () => {
    setPreview(null)
    setFileName("")
    setState("idle")
    setErrorMsg("")
    setImportResult(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="space-y-6">
      {/* Step 1 — Download */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#217346] text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
          <h3 className="font-semibold text-sm">Download the template</h3>
        </div>
        <p className="text-sm text-muted-foreground pl-8">
          Download a blank Excel template with the correct columns, or download the current extracted data to correct it.
        </p>
        <div className="pl-8 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2 border-[#217346] text-[#217346] hover:bg-[#217346]/10"
            onClick={() => downloadBlankTemplate(depotName)}>
            <Download className="h-4 w-4" />
            Blank Template
          </Button>
          {currentItems.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => downloadCurrentData(currentItems, depotName)}>
              <Download className="h-4 w-4" />
              Current Data ({currentItems.length} items)
            </Button>
          )}
        </div>
        <div className="pl-8">
          <p className="text-xs text-muted-foreground">
            Required columns: <span className="font-mono bg-muted px-1 rounded">Tile Name</span>
            {" "}(required) · Design · Brand · Size · Finish ·{" "}
            <span className="font-mono bg-muted px-1 rounded">Boxes</span> · Pcs · Location
          </p>
        </div>
      </div>

      {/* Step 2 — Fill in */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#217346] text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
          <h3 className="font-semibold text-sm">Fill in the correct data</h3>
        </div>
        <p className="text-sm text-muted-foreground pl-8">
          Open the Excel file and enter or correct the tile data for <strong>{depotName}</strong>.
          Each row = one tile. Leave unused columns blank.
          Save the file when done.
        </p>
      </div>

      {/* Step 3 — Upload */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#217346] text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
          <h3 className="font-semibold text-sm">Upload the completed template</h3>
        </div>

        {state === "idle" && (
          <div
            className="pl-8 border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-[#217346]/60 hover:bg-[#217346]/5 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Drop your Excel file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx or .xls files</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        )}

        {state === "parsing" && (
          <div className="pl-8 flex items-center gap-3 text-muted-foreground py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Reading Excel file…</span>
          </div>
        )}

        {state === "error" && (
          <div className="pl-8 space-y-3">
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {errorMsg}
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Try again</Button>
          </div>
        )}

        {state === "done" && importResult && (
          <div className="pl-8 space-y-3">
            <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
              <div>
                <p className="font-semibold">Teaching complete!</p>
                <p className="mt-0.5">
                  <strong>{importResult.itemCount}</strong> items imported for <strong>{depotName}</strong>.
                  The stock data has been updated with your corrections.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Upload another template</Button>
          </div>
        )}

        {(state === "preview" || state === "importing") && preview && (
          <div className="pl-8 space-y-4">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-[#217346]" />
                <span className="font-medium">{fileName}</span>
              </div>
              <Badge variant="secondary">{preview.length} items found</Badge>
            </div>

            {/* Stock date */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0">Stock date:</label>
              <input type="date" value={stockDate}
                onChange={(e) => setStockDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
              This will <strong>replace all existing stock</strong> for <strong>{depotName}</strong> with the {preview.length} items below.
            </div>

            {/* Preview table */}
            <div className="rounded-md border border-[#a3b8a3] overflow-hidden">
              <div className="bg-[#217346] px-3 py-1.5 flex items-center justify-between">
                <span className="text-white text-xs font-semibold">Preview — first 10 rows</span>
                <span className="text-white/70 text-xs">{preview.length} total</span>
              </div>
              <div className="overflow-auto max-h-52">
                <table className="w-full text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr>
                      {["#", "Tile Name", "Brand", "Size", "Finish", "Boxes", "Pcs"].map(h => (
                        <th key={h} className="border border-[#a3b8a3] bg-[#217346] text-white px-2 py-1.5 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f2f7f2]"}>
                        <td className="border border-[#c8d8c8] px-2 py-1.5 text-[#6a8a6a] w-8">{i + 1}</td>
                        <td className="border border-[#c8d8c8] px-2 py-1.5 font-medium">{row.tileName}</td>
                        <td className="border border-[#c8d8c8] px-2 py-1.5">{row.brand || "—"}</td>
                        <td className="border border-[#c8d8c8] px-2 py-1.5 font-mono">{row.size || "—"}</td>
                        <td className="border border-[#c8d8c8] px-2 py-1.5">{row.finish || "—"}</td>
                        <td className="border border-[#c8d8c8] px-2 py-1.5 text-right text-[#217346] font-bold">{row.boxCount}</td>
                        <td className="border border-[#c8d8c8] px-2 py-1.5 text-right">{row.pcsCount || ""}</td>
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td colSpan={7} className="border border-[#c8d8c8] px-2 py-1.5 text-center text-[#6a8a6a] italic">
                          …and {preview.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                className="bg-[#217346] hover:bg-[#1a5c38] text-white gap-2"
                onClick={handleConfirmImport}
                disabled={state === "importing"}
              >
                {state === "importing" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Importing…</>
                ) : (
                  <><GraduationCap className="h-4 w-4" />Confirm & Teach App</>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={reset} disabled={state === "importing"}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── study tab (excel-like view) ───────────────────────────────── */

function StudyTab({ items, depotName, isLoading, isFetching }: {
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
      <p className="text-sm max-w-xs">Upload a PDF report or use the Teach tab to import data for this depot.</p>
    </div>
  )

  const Th = ({ children, align = "left", w }: { children: React.ReactNode; align?: string; w?: string }) => (
    <th className="border border-[#a3b8a3] bg-[#217346] text-white px-3 py-2 text-xs font-bold tracking-wide whitespace-nowrap"
      style={{ textAlign: align as any, width: w }}>{children}</th>
  )

  return (
    <div className="rounded-md border border-[#a3b8a3] overflow-hidden shadow-sm">
      <div className="bg-[#217346] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-white" />
          <span className="text-white text-sm font-semibold">{depotName} — Extracted Stock</span>
        </div>
        {isFetching && <Loader2 className="h-3.5 w-3.5 text-white/70 animate-spin" />}
      </div>

      <div className="overflow-auto max-h-[55vh]">
        <table className="w-full text-xs text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#d0e4d0] border-b border-[#a3b8a3]">
              <th className="border border-[#a3b8a3] px-2 py-1 text-center text-[10px] font-bold text-[#3a5a3a] w-10">#</th>
              {["A","B","C","D","E","F","G"].map(l => (
                <th key={l} className="border border-[#a3b8a3] px-2 py-1 text-center text-[10px] font-bold text-[#3a5a3a]">{l}</th>
              ))}
            </tr>
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
              const even = idx % 2 === 0
              const bg = even ? "bg-white" : "bg-[#f2f7f2]"
              const cell = `border border-[#c8d8c8] px-3 py-2 ${bg}`
              return (
                <tr key={item.id} className={`${bg} hover:bg-[#e6f0e6] transition-colors`}>
                  <td className="border border-[#c8d8c8] px-2 py-2 text-center text-[10px] font-mono text-[#6a8a6a] bg-[#f0f5f0] w-10">{idx + 1}</td>
                  <td className={cell}>
                    {item.hasImage
                      ? <TileThumb id={item.id} name={item.tileName} />
                      : <div className="w-12 h-12 rounded border border-dashed border-[#b7c4b7] bg-[#f5f8f5] flex items-center justify-center"><ImageOff className="h-4 w-4 text-[#b0bdb0]" /></div>
                    }
                  </td>
                  <td className={cell}>
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground text-sm leading-tight">{item.tileName}</span>
                      {item.design && <span className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1"><LayoutGrid className="h-2.5 w-2.5" />{item.design}</span>}
                    </div>
                  </td>
                  <td className={cell}>
                    {item.brand
                      ? <span className="inline-block border border-[#a3b8a3] bg-[#eaf3ea] text-[#2d5a2d] rounded px-2 py-0.5 text-[10px] font-semibold">{item.brand}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={cell}>
                    <div className="flex flex-col gap-1">
                      {item.size && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Ruler className="h-3 w-3 shrink-0" /><span className="font-mono bg-[#e8f0e8] border border-[#c8d8c8] px-1.5 rounded">{item.size}</span></div>}
                      {item.finish && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Palette className="h-3 w-3 shrink-0" />{item.finish}</div>}
                      {!item.size && !item.finish && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className={`${cell} text-right`}>
                    <div className="flex flex-col items-end">
                      <div className="inline-flex items-baseline gap-0.5">
                        <span className="text-base font-bold text-[#217346]">{item.boxCount ?? 0}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase ml-0.5">Box</span>
                      </div>
                      {item.pcsCount != null && Number(item.pcsCount) > 0 && <span className="text-[10px] text-muted-foreground">+ {item.pcsCount} pcs</span>}
                    </div>
                  </td>
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
            {Array(3).fill(0).map((_, i) => (
              <tr key={`e${i}`} className={i % 2 === 0 ? "bg-white" : "bg-[#f2f7f2]"}>
                <td className="border border-[#c8d8c8] px-2 py-2 text-center text-[10px] font-mono text-[#c0cac0] bg-[#f0f5f0] w-10">{items.length + i + 1}</td>
                {Array(7).fill(0).map((_, j) => <td key={j} className="border border-[#c8d8c8] px-3 py-4" />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  const initTab   = (params.get("tab") as "study" | "teach") || "study"

  const [selectedDepot, setSelectedDepot] = useState<number | null>(initDepot)
  const [activeTab, setActiveTab] = useState<"study" | "teach">(initTab)

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
    if (activeTab !== "study") p.set("tab", activeTab)
    const qs = p.toString()
    window.history.replaceState(null, "", import.meta.env.BASE_URL.replace(/\/$/, "") + (qs ? `/template-study?${qs}` : "/template-study"))
  }, [selectedDepot, activeTab])

  const Tab = ({ id, label, icon: Icon }: { id: "study" | "teach"; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        activeTab === id
          ? "border-[#217346] text-[#217346]"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
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
          Study extracted data for each depot, or teach the app by uploading a corrected Excel template.
        </p>
      </div>

      {/* Depot selector + item count */}
      <div className="flex flex-wrap items-center gap-3">
        {loadingDepots ? <Skeleton className="h-9 w-52" /> : (
          <DepotSelect value={selectedDepot} onChange={(id) => { setSelectedDepot(id); setActiveTab("study") }} depots={depots ?? []} />
        )}
        {selectedDepot && items.length > 0 && (
          <Badge variant="secondary" className="text-xs">{items.length.toLocaleString()} items extracted</Badge>
        )}
        {selectedDepot && !loadingStock && items.length === 0 && (
          <Badge variant="outline" className="text-xs text-muted-foreground">No data yet</Badge>
        )}
      </div>

      {!selectedDepot ? (
        /* No depot selected yet */
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-20 flex flex-col items-center text-center gap-3 text-muted-foreground">
          <FileSpreadsheet className="h-14 w-14 opacity-20" />
          <p className="font-medium">Select a depot above to begin</p>
          <p className="text-sm max-w-xs">Choose a depot to study its extracted data or teach the app with a corrected Excel template.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-border gap-0">
            <Tab id="study" label="Study Extracted Data" icon={Eye} />
            <Tab id="teach" label="Teach / Correct Data" icon={GraduationCap} />
          </div>

          {/* Tab content */}
          {activeTab === "study" && (
            <div className="space-y-3">
              {/* Info + download buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0 rounded-md border border-[#217346]/30 bg-[#217346]/5 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 text-[#217346] shrink-0" />
                  This shows what was extracted from the last PDF upload. If data looks wrong, use the <strong>Teach</strong> tab to upload a corrected Excel.
                </div>
                {items.length > 0 && (
                  <Button variant="outline" size="sm" className="gap-2 border-[#217346] text-[#217346] hover:bg-[#217346]/10 shrink-0"
                    onClick={() => downloadCurrentData(items, depotLabel)}>
                    <Download className="h-4 w-4" />
                    Download Excel
                  </Button>
                )}
              </div>

              <StudyTab items={items} depotName={depotLabel} isLoading={loadingStock} isFetching={isFetching} />
            </div>
          )}

          {activeTab === "teach" && (
            <TeachTab depotId={selectedDepot} depotName={depotLabel} currentItems={items} />
          )}
        </>
      )}
    </div>
  )
}
