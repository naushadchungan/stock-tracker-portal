import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useLocation } from "wouter"
import {
  FileText,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  X,
  File,
  Layers,
} from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { formatDate, formatTime } from "@/lib/utils"

import {
  useListDepots,
  useUploadPdf,
  useListUploads,
  useGetUpload,
  getGetUploadQueryKey,
  getListUploadsQueryKey,
  getListStockQueryKey,
  getGetStockSummaryQueryKey,
  type Upload,
} from "@workspace/api-client-react"

// ─── Single Upload ────────────────────────────────────────────────────────────

function SingleUpload() {
  const [, setLocation] = useLocation()
  const searchParams = new URLSearchParams(window.location.search)
  const initialDepotId = searchParams.get("depotId")

  const [depotId, setDepotId] = useState<string>(initialDepotId || "")
  const [stockDate, setStockDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [file, setFile] = useState<File | null>(null)
  const [activeUploadId, setActiveUploadId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const { data: recentUploads, isLoading: isLoadingUploads } = useListUploads({ limit: 5 })

  const { data: uploadStatus } = useGetUpload(activeUploadId as number, {
    query: {
      queryKey: getGetUploadQueryKey(activeUploadId as number),
      enabled: !!activeUploadId,
      refetchInterval: (query) => {
        const status = (query.state.data as Upload | undefined)?.status
        return status === "processing" || status === "pending" ? 2000 : false
      },
    },
  })

  useEffect(() => {
    if (!uploadStatus) return
    const status = uploadStatus.status
    if (status === "done") {
      toast.success(`Successfully extracted ${uploadStatus.itemsExtracted} items from PDF`)
      setActiveUploadId(null)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
      queryClient.invalidateQueries({ queryKey: getListStockQueryKey() })
      queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() })
    } else if (status === "failed") {
      toast.error(`Upload failed: ${uploadStatus.errorMessage || "Unknown error"}`)
      setActiveUploadId(null)
    }
  }, [uploadStatus, queryClient])

  const uploadMutation = useUploadPdf()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected && selected.type === "application/pdf") {
      setFile(selected)
    } else if (selected) {
      toast.error("Please select a valid PDF file")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped && dropped.type === "application/pdf") {
      setFile(dropped)
    } else if (dropped) {
      toast.error("Please drop a valid PDF file")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!depotId) { toast.error("Please select a depot"); return }
    if (!file) { toast.error("Please select a PDF file"); return }
    try {
      const result = await uploadMutation.mutateAsync({
        data: { depotId: parseInt(depotId, 10), stockDate: stockDate || undefined, file },
      })
      setActiveUploadId(result.id)
      toast.info("Upload started, processing PDF…")
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to upload file")
    }
  }

  const isProcessing = activeUploadId !== null || uploadMutation.isPending

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Report Details</CardTitle>
            <CardDescription>Select the depot and the date of the stock report.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="depot">Depot <span className="text-destructive">*</span></Label>
                  <Select
                    id="depot"
                    value={depotId}
                    onChange={(e) => setDepotId(e.target.value)}
                    disabled={isLoadingDepots || isProcessing}
                  >
                    <option value="" disabled>Select a depot</option>
                    {depots?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Stock Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={stockDate}
                    onChange={(e) => setStockDate(e.target.value)}
                    disabled={isProcessing}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>PDF File <span className="text-destructive">*</span></Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors
                    ${isProcessing ? "bg-muted opacity-60 pointer-events-none" : "hover:bg-muted/50 cursor-pointer"}
                    ${file ? "border-primary/50 bg-primary/5" : "border-border"}`}
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    disabled={isProcessing}
                  />
                  {file ? (
                    <div className="flex flex-col items-center">
                      <FileText className="h-12 w-12 text-primary mb-3" />
                      <span className="font-semibold text-foreground">{file.name}</span>
                      <span className="text-sm text-muted-foreground mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      {!isProcessing && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFile(null)
                            if (fileInputRef.current) fileInputRef.current.value = ""
                          }}
                        >
                          <X className="h-4 w-4 mr-2" /> Remove
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <UploadCloud className="h-12 w-12 text-muted-foreground mb-3" />
                      <span className="font-semibold text-foreground mb-1">Click to browse or drag file here</span>
                      <span className="text-sm text-muted-foreground">Only PDF files are supported</span>
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={!depotId || !file || isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadStatus?.status === "processing" ? "Extracting PDF Data…" : "Uploading…"}
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload Stock Report
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="flex flex-col divide-y divide-border">
              {isLoadingUploads ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="p-4 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                      <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  </div>
                ))
              ) : recentUploads?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No recent uploads found.</div>
              ) : (
                recentUploads?.map((upload) => (
                  <div key={upload.id} className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    {upload.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : upload.status === "failed" ? (
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold truncate text-foreground">{upload.filename}</p>
                        <Badge
                          variant={upload.status === "done" ? "success" : upload.status === "failed" ? "destructive" : "secondary"}
                          className="capitalize shrink-0 text-[10px] px-1.5 py-0"
                        >
                          {upload.status}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" /> {upload.depotName}</span>
                        <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {formatDate(upload.createdAt)} at {formatTime(upload.createdAt)}</span>
                      </div>
                      {upload.status === "done" && (
                        <p className="text-xs text-emerald-600 mt-2 font-medium">Extracted {upload.itemsExtracted} items</p>
                      )}
                      {upload.status === "failed" && upload.errorMessage && (
                        <p className="text-xs text-destructive mt-2">{upload.errorMessage}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 pt-2 border-t border-border">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setLocation("/stock")}>
                Search Stock Instead
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Bulk Upload ──────────────────────────────────────────────────────────────

type DepotRowState = {
  depotId: number
  depotName: string
  file: File | null
  uploadId: number | null
  status: "idle" | "uploading" | "processing" | "done" | "failed"
  itemsExtracted?: number
  errorMessage?: string
}

function BulkUploadSection() {
  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const uploadMutation = useUploadPdf()
  const queryClient = useQueryClient()

  const [stockDate, setStockDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [rows, setRows] = useState<DepotRowState[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialise rows whenever depots load
  useEffect(() => {
    if (!depots) return
    setRows(depots.map((d) => ({
      depotId: d.id,
      depotName: d.name,
      file: null,
      uploadId: null,
      status: "idle",
    })))
  }, [depots])

  const updateRow = useCallback((depotId: number, patch: Partial<DepotRowState>) => {
    setRows((prev) => prev.map((r) => r.depotId === depotId ? { ...r, ...patch } : r))
  }, [])

  // Polling for active uploads
  useEffect(() => {
    pollingRef.current = setInterval(async () => {
      const active = rows.filter((r) => r.uploadId && (r.status === "uploading" || r.status === "processing"))
      if (active.length === 0) return

      await Promise.all(active.map(async (row) => {
        try {
          const res = await fetch(`/api/uploads/${row.uploadId}`, { credentials: "include" })
          if (!res.ok) return
          const data = await res.json() as Upload
          if (data.status === "done") {
            updateRow(row.depotId, { status: "done", itemsExtracted: data.itemsExtracted ?? undefined, uploadId: null })
            queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
            queryClient.invalidateQueries({ queryKey: getListStockQueryKey() })
            queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() })
          } else if (data.status === "failed") {
            updateRow(row.depotId, { status: "failed", errorMessage: data.errorMessage ?? "Processing failed", uploadId: null })
          } else {
            updateRow(row.depotId, { status: "processing" })
          }
        } catch { /* ignore */ }
      }))
    }, 2500)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [rows, updateRow, queryClient])

  const handleFileChange = (depotId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.type === "application/pdf") {
      updateRow(depotId, { file: f, status: "idle" })
    } else if (f) {
      toast.error("Only PDF files are accepted")
      e.target.value = ""
    }
  }

  const clearFile = (depotId: number) => {
    updateRow(depotId, { file: null, status: "idle", uploadId: null, errorMessage: undefined, itemsExtracted: undefined })
    const ref = fileInputRefs.current.get(depotId)
    if (ref) ref.value = ""
  }

  const handleUploadAll = async () => {
    const toUpload = rows.filter((r) => r.file && r.status === "idle")
    if (toUpload.length === 0) {
      toast.error("Please select at least one PDF file")
      return
    }
    setIsSubmitting(true)
    try {
      await Promise.all(toUpload.map(async (row) => {
        updateRow(row.depotId, { status: "uploading" })
        try {
          const result = await uploadMutation.mutateAsync({
            data: { depotId: row.depotId, stockDate: stockDate || undefined, file: row.file! },
          })
          updateRow(row.depotId, { uploadId: result.id, status: "processing" })
        } catch (err: any) {
          updateRow(row.depotId, {
            status: "failed",
            errorMessage: err?.response?.data?.error || "Upload failed",
          })
        }
      }))
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
      toast.info(`Uploading ${toUpload.length} depot${toUpload.length > 1 ? "s" : ""}… processing in background`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCount = rows.filter((r) => r.file).length
  const processingCount = rows.filter((r) => r.status === "uploading" || r.status === "processing").length
  const doneCount = rows.filter((r) => r.status === "done").length
  const failedCount = rows.filter((r) => r.status === "failed").length
  const isAnyActive = processingCount > 0 || isSubmitting

  const resetAll = () => {
    setRows((prev) => prev.map((r) => ({
      ...r, file: null, uploadId: null, status: "idle", itemsExtracted: undefined, errorMessage: undefined,
    })))
    fileInputRefs.current.forEach((ref) => { ref.value = "" })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Bulk Upload — All Depots
            </CardTitle>
            <CardDescription className="mt-1">
              Assign a PDF to each depot and upload all at once. Only depots with a file selected will be uploaded.
            </CardDescription>
          </div>
          {(doneCount > 0 || failedCount > 0) && !isAnyActive && (
            <Button variant="outline" size="sm" onClick={resetAll} className="shrink-0">
              <X className="h-4 w-4 mr-1.5" /> Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Date picker */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="bulk-date" className="whitespace-nowrap text-sm">Stock Date</Label>
            <Input
              id="bulk-date"
              type="date"
              value={stockDate}
              onChange={(e) => setStockDate(e.target.value)}
              disabled={isAnyActive}
              max={new Date().toISOString().split("T")[0]}
              className="w-40"
            />
          </div>
          {selectedCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {selectedCount} depot{selectedCount !== 1 ? "s" : ""} selected
            </span>
          )}
        </div>

        {/* Summary bar when active */}
        {isAnyActive && (
          <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-sm">
            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            <span className="text-foreground font-medium">
              Processing {processingCount} depot{processingCount !== 1 ? "s" : ""}…
            </span>
            {doneCount > 0 && <span className="text-emerald-600 font-medium">{doneCount} done</span>}
            {failedCount > 0 && <span className="text-destructive font-medium">{failedCount} failed</span>}
          </div>
        )}

        {/* Depot rows */}
        {isLoadingDepots ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border border rounded-lg overflow-hidden">
            {rows.map((row) => {
              const busy = row.status === "uploading" || row.status === "processing"
              return (
                <div
                  key={row.depotId}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    row.status === "done" ? "bg-emerald-50/60 dark:bg-emerald-950/20" :
                    row.status === "failed" ? "bg-destructive/5" :
                    busy ? "bg-primary/5" : "bg-card hover:bg-muted/30"
                  }`}
                >
                  {/* Status icon */}
                  <div className="w-5 shrink-0 flex justify-center">
                    {row.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : row.status === "failed" ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : busy ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Depot name */}
                  <span className="w-40 shrink-0 text-sm font-medium text-foreground truncate">{row.depotName}</span>

                  {/* File picker / status */}
                  <div className="flex-1 min-w-0">
                    {row.status === "done" ? (
                      <span className="text-xs text-emerald-600 font-medium">
                        ✓ {row.itemsExtracted} items extracted
                      </span>
                    ) : row.status === "failed" ? (
                      <span className="text-xs text-destructive truncate">{row.errorMessage}</span>
                    ) : busy ? (
                      <span className="text-xs text-primary">
                        {row.status === "uploading" ? "Uploading…" : "Extracting data…"}
                      </span>
                    ) : row.file ? (
                      <div className="flex items-center gap-2">
                        <File className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs text-foreground truncate">{row.file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({(row.file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file selected</span>
                    )}
                  </div>

                  {/* Action button */}
                  {!busy && row.status !== "done" && (
                    <>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        ref={(el) => { if (el) fileInputRefs.current.set(row.depotId, el) }}
                        onChange={(e) => handleFileChange(row.depotId, e)}
                      />
                      {row.file ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => clearFile(row.depotId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => fileInputRefs.current.get(row.depotId)?.click()}
                        >
                          Choose PDF
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Upload All button */}
        <Button
          className="w-full"
          size="lg"
          disabled={selectedCount === 0 || isAnyActive}
          onClick={handleUploadAll}
        >
          {isAnyActive ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing {processingCount} depot{processingCount !== 1 ? "s" : ""}…
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4 mr-2" />
              Upload All {selectedCount > 0 ? `(${selectedCount} depot${selectedCount !== 1 ? "s" : ""})` : ""}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UploadReport() {
  const [tab, setTab] = useState<"single" | "bulk">("bulk")

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Stock Report</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload daily PDF stock sheets to update the inventory system.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("bulk")}
          className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === "bulk"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Bulk Upload
        </button>
        <button
          onClick={() => setTab("single")}
          className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === "single"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <UploadCloud className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Single Upload
        </button>
      </div>

      {tab === "bulk" ? <BulkUploadSection /> : <SingleUpload />}
    </div>
  )
}
