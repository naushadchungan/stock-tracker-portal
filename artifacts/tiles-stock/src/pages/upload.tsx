import * as React from "react"
import { useState, useRef, useEffect } from "react"
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
  File
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
  type Upload
} from "@workspace/api-client-react"

export default function UploadReport() {
  const [location, setLocation] = useLocation()
  const searchParams = new URLSearchParams(window.location.search)
  const initialDepotId = searchParams.get('depotId')

  const [depotId, setDepotId] = useState<string>(initialDepotId || "")
  const [stockDate, setStockDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [file, setFile] = useState<File | null>(null)
  const [activeUploadId, setActiveUploadId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Queries
  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const { data: recentUploads, isLoading: isLoadingUploads } = useListUploads({ limit: 5 })
  
  // Polling query
  const { data: uploadStatus } = useGetUpload(activeUploadId as number, {
    query: {
      queryKey: getGetUploadQueryKey(activeUploadId as number),
      enabled: !!activeUploadId,
      refetchInterval: (query) => {
        const status = (query.state.data as Upload | undefined)?.status;
        return status === 'processing' || status === 'pending' ? 2000 : false;
      }
    }
  })

  // Check upload status updates
  useEffect(() => {
    if (!uploadStatus) return;
    
    // In our generated orval client, data is directly the object, no wrapper
    const status = uploadStatus.status;
    
    if (status === 'done') {
      toast.success(`Successfully extracted ${uploadStatus.itemsExtracted} items from PDF`)
      setActiveUploadId(null)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
      queryClient.invalidateQueries({ queryKey: getListStockQueryKey() })
      queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() })
      
    } else if (status === 'failed') {
      toast.error(`Upload failed: ${uploadStatus.errorMessage || 'Unknown error'}`)
      setActiveUploadId(null)
    }
  }, [uploadStatus, queryClient])

  // Mutation
  const uploadMutation = useUploadPdf()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected && selected.type === "application/pdf") {
      setFile(selected)
    } else if (selected) {
      toast.error("Please select a valid PDF file")
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!depotId) {
      toast.error("Please select a depot")
      return
    }
    
    if (!file) {
      toast.error("Please select a PDF file")
      return
    }

    try {
      const result = await uploadMutation.mutateAsync({
        data: {
          depotId: parseInt(depotId, 10),
          stockDate: stockDate || undefined,
          file,
        }
      })
      
      setActiveUploadId(result.id)
      toast.info("Upload started, processing PDF...")
      
      // Invalidate uploads list to show pending
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })
      
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to upload file")
    }
  }

  const isProcessing = activeUploadId !== null || uploadMutation.isPending

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Stock Report</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload daily PDF stock sheets to update the inventory system.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Report Details</CardTitle>
              <CardDescription>
                Select the depot and the date of the stock report.
              </CardDescription>
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
                      {depots?.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
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
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>PDF File <span className="text-destructive">*</span></Label>
                  
                  <div 
                    className={`
                      border-2 border-dashed rounded-lg p-10 text-center transition-colors
                      ${isProcessing ? 'bg-muted opacity-60 pointer-events-none' : 'hover:bg-muted/50 cursor-pointer'}
                      ${file ? 'border-primary/50 bg-primary/5' : 'border-border'}
                    `}
                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
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
                              e.stopPropagation();
                              setFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
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

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={!depotId || !file || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {uploadStatus?.status === 'processing' ? 'Extracting PDF Data...' : 'Uploading...'}
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
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No recent uploads found.
                  </div>
                ) : (
                  recentUploads?.map((upload) => (
                    <div key={upload.id} className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                      {upload.status === 'done' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : upload.status === 'failed' ? (
                        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0 mt-0.5" />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold truncate text-foreground">
                            {upload.filename}
                          </p>
                          <Badge variant={
                            upload.status === 'done' ? 'success' : 
                            upload.status === 'failed' ? 'destructive' : 
                            'secondary'
                          } className="capitalize shrink-0 text-[10px] px-1.5 py-0">
                            {upload.status}
                          </Badge>
                        </div>
                        
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3 w-3" /> {upload.depotName}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" /> {formatDate(upload.createdAt)} at {formatTime(upload.createdAt)}
                          </span>
                        </div>
                        
                        {upload.status === 'done' && (
                          <p className="text-xs text-emerald-600 mt-2 font-medium">
                            Extracted {upload.itemsExtracted} items
                          </p>
                        )}
                        {upload.status === 'failed' && upload.errorMessage && (
                          <p className="text-xs text-destructive mt-2">
                            {upload.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 pt-2 border-t border-border">
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setLocation('/stock')}>
                  Search Stock Instead
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
