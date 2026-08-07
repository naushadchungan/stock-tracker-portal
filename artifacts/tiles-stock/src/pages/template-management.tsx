import * as React from "react"
import { useMemo, useState } from "react"
import { Search, MoreHorizontal, RefreshCw, Eye, Ban, Trash2, Layers } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TemplateRow {
  id: number
  name: string
  supplier: string
  version: number
  fingerprint: string
  matchCount: number
  averageConfidence: number
  successRate: number
  lastUsed: string
  status: "Active" | "Disabled"
}

const sampleTemplates: TemplateRow[] = [
  {
    id: 1,
    name: "North Depot Standard",
    supplier: "ADIE",
    version: 3,
    fingerprint: "fp-1048-a1",
    matchCount: 42,
    averageConfidence: 92,
    successRate: 96,
    lastUsed: "2026-08-06",
    status: "Active",
  },
  {
    id: 2,
    name: "South Depot Variant",
    supplier: "Claude",
    version: 2,
    fingerprint: "fp-2048-b2",
    matchCount: 19,
    averageConfidence: 81,
    successRate: 84,
    lastUsed: "2026-08-04",
    status: "Active",
  },
  {
    id: 3,
    name: "West Warehouse Layout",
    supplier: "ADIE",
    version: 1,
    fingerprint: "fp-3091-c3",
    matchCount: 8,
    averageConfidence: 67,
    successRate: 72,
    lastUsed: "2026-07-29",
    status: "Disabled",
  },
]

type SortKey = "name" | "matchCount" | "lastUsed"
type SortDirection = "asc" | "desc"

const backendIntegrationPending = "Backend integration pending"

export default function TemplateManagementPage() {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = sampleTemplates.filter((template) => {
      if (!query) return true
      return [
        template.name,
        template.supplier,
        template.fingerprint,
        template.status,
      ].some((value) => value.toLowerCase().includes(query))
    })

    if (!sortKey) return filtered

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        const result = a.name.localeCompare(b.name)
        return sortDirection === "asc" ? result : -result
      }

      if (sortKey === "matchCount") {
        const result = a.matchCount - b.matchCount
        return sortDirection === "asc" ? result : -result
      }

      const result = a.lastUsed.localeCompare(b.lastUsed)
      return sortDirection === "asc" ? result : -result
    })
  }, [search, sortKey, sortDirection])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection("asc")
  }

  // TODO: Replace the mock template rows with real backend data once a template list API is available.
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Template Management</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review and manage learned templates with mock data for now.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Template Library
              </CardTitle>
              <CardDescription className="mt-1">
                Search templates and review their usage and confidence metrics.
              </CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                    Template Name
                  </TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Fingerprint</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("matchCount")}>
                    Match Count
                  </TableHead>
                  <TableHead>Average Confidence</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("lastUsed")}>
                    Last Used
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{template.supplier}</TableCell>
                    <TableCell>{template.version}</TableCell>
                    <TableCell className="font-mono text-xs">{template.fingerprint}</TableCell>
                    <TableCell>{template.matchCount}</TableCell>
                    <TableCell>{template.averageConfidence}%</TableCell>
                    <TableCell>{template.successRate}%</TableCell>
                    <TableCell>{template.lastUsed}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${template.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {template.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{backendIntegrationPending}</TooltipContent>
                              </Tooltip>
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <RefreshCw className="mr-2 h-4 w-4" /> Relearn
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Ban className="mr-2 h-4 w-4" /> Disable
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
