import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  X,
  File,
  Layers,
} from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils"

import {
  useListDepots,
  useUploadPdf,
  useListUploads,
  getListUploadsQueryKey,
  getListStockQueryKey,
  getGetStockSummaryQueryKey,
  type Upload,
} from "@workspace/api-client-react"

// ─── Bulk Upload ──────────────────────────────────────────────────────────────

type DepotRowState = {
  depotId: number
  depotName: string
  file: File | null
  uploadId: number | null
  status: "idle" | "uploading" | "processing" | "done" | "failed"
  itemsExtracted?: number
  errorMessage?: string
  processingTimeMs?: number
  parserUsed?: string
  templateMatched?: string
  similarityScore?: number
  confidenceScore?: number
  confidenceDecision?: string
  claudeUsed?: boolean
  validationRequired?: boolean
}

const formatParserUsed = (value?: string | null) => {
  if (value == null || value === "") return null

  switch (value) {
    case "learned-template-extractor":
      return "Learned Template"
    case "vision":
      return "Vision OCR"
    case "legacy-parser":
      return "Legacy Parser"
    default:
      return value
  }
}

const formatConfidenceScore = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) return null
  return `${Math.round(value)}%`
}

export default function UploadReport() {
  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const { data: recentUploads } = useListUploads({ limit: 5 })
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
          const metadataPatch = {
            processingTimeMs: data.processingTimeMs ?? undefined,
            parserUsed: data.parserUsed ?? undefined,
            templateMatched: data.templateMatched ?? undefined,
            similarityScore: data.similarityScore ?? undefined,
            confidenceScore: data.confidenceScore ?? undefined,
            confidenceDecision: data.confidenceDecision ?? undefined,
            claudeUsed: data.claudeUsed ?? undefined,
            validationRequired: data.validationRequired ?? undefined,
          }

          if (data.status === "done") {
            updateRow(row.depotId, { status: "done", itemsExtracted: data.itemsExtracted ?? undefined, uploadId: null, ...metadataPatch })
            queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
            queryClient.invalidateQueries({ queryKey: getListStockQueryKey() })
            queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() })
          } else if (data.status === "failed") {
            updateRow(row.depotId, { status: "failed", errorMessage: data.errorMessage ?? "Processing failed", uploadId: null, ...metadataPatch })
          } else {
            updateRow(row.depotId, { status: "processing", ...metadataPatch })
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
          updateRow(row.depotId, {
            uploadId: result.id,
            status: "processing",
            processingTimeMs: result.processingTimeMs ?? undefined,
            parserUsed: result.parserUsed ?? undefined,
            templateMatched: result.templateMatched ?? undefined,
            similarityScore: result.similarityScore ?? undefined,
            confidenceScore: result.confidenceScore ?? undefined,
            confidenceDecision: result.confidenceDecision ?? undefined,
            claudeUsed: result.claudeUsed ?? undefined,
            validationRequired: result.validationRequired ?? undefined,
          })
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
      ...r,
      file: null,
      uploadId: null,
      status: "idle",
      itemsExtracted: undefined,
      errorMessage: undefined,
      processingTimeMs: undefined,
      parserUsed: undefined,
      templateMatched: undefined,
      similarityScore: undefined,
      confidenceScore: undefined,
      confidenceDecision: undefined,
      claudeUsed: undefined,
      validationRequired: undefined,
    })))
    fileInputRefs.current.forEach((ref) => { ref.value = "" })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Stock Report</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload daily PDF stock sheets to update the inventory system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Upload — All Depots
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
                const showSummary = row.status === "done"
                const summaryItems = [
                  { label: "Upload status", value: row.status === "done" ? "Completed" : "Not Available" },
                  { label: "Processing time", value: row.processingTimeMs != null ? `${row.processingTimeMs} ms` : "Not Available" },
                  { label: "Items extracted", value: row.itemsExtracted != null ? `${row.itemsExtracted}` : "Not Available" },
                  { label: "Parser used", value: row.parserUsed != null && row.parserUsed !== "" ? formatParserUsed(row.parserUsed) ?? row.parserUsed : "Not Available" },
                  { label: "Template matched", value: row.templateMatched != null && row.templateMatched !== "" ? row.templateMatched : "Not Available" },
                  { label: "Similarity score", value: row.similarityScore != null ? `${row.similarityScore}` : "Not Available" },
                  { label: "Confidence score", value: row.confidenceScore != null ? formatConfidenceScore(row.confidenceScore) ?? `${row.confidenceScore}` : "Not Available" },
                  { label: "Confidence decision", value: row.confidenceDecision != null && row.confidenceDecision !== "" ? row.confidenceDecision : "Not Available" },
                  { label: "Claude used", value: row.claudeUsed == null ? "Not Available" : row.claudeUsed ? "Yes" : "No" },
                  { label: "Validation required", value: row.validationRequired == null ? "Not Available" : row.validationRequired ? "Yes" : "No" },
                ]

                return (
                  <div
                    key={row.depotId}
                    className={`transition-colors ${
                      row.status === "done" ? "bg-emerald-50/60 dark:bg-emerald-950/20" :
                      row.status === "failed" ? "bg-destructive/5" :
                      busy ? "bg-primary/5" : "bg-card hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
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

                    {showSummary && (
                      <div className="mx-4 mb-3 rounded-lg border border-emerald-200 bg-background/80 p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {summaryItems.map((item) => (
                            <div key={item.label} className="text-sm">
                              <span className="text-muted-foreground">{item.label}: </span>
                              <span className="font-medium text-foreground">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
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

      {/* Recent uploads */}
      {recentUploads && recentUploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="flex flex-col divide-y divide-border">
              {recentUploads.map((upload) => (
                <div key={upload.id} className="px-6 py-3 flex items-center gap-3">
                  {upload.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : upload.status === "failed" ? (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{upload.depotName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(upload.createdAt)}
                      {upload.status === "done" && ` · ${upload.itemsExtracted} items`}
                      {upload.status === "failed" && ` · ${upload.errorMessage}`}
                    </p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${
                    upload.status === "done" ? "text-emerald-600" :
                    upload.status === "failed" ? "text-destructive" : "text-primary"
                  }`}>
                    {upload.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
