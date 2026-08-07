import * as React from "react"
import { useMemo, useState } from "react"
import { CheckCircle2, CircleDashed, Play, RefreshCw, Layers, TrendingUp } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface RegressionTestRow {
  id: number
  name: string
  supplier: string
  expectedItems: number
  actualItems: number
  parserUsed: string
  templateUsed: string
  confidence: number
  claudeUsed: boolean
  processingTime: string
  result: "PASS" | "FAIL"
}

const mockRegressionTests: RegressionTestRow[] = [
  {
    id: 1,
    name: "North Depot Standard",
    supplier: "ADIE",
    expectedItems: 18,
    actualItems: 18,
    parserUsed: "Learned Template",
    templateUsed: "fp-1048-a1",
    confidence: 94,
    claudeUsed: false,
    processingTime: "1.2s",
    result: "PASS",
  },
  {
    id: 2,
    name: "South Depot Variant",
    supplier: "Claude",
    expectedItems: 14,
    actualItems: 12,
    parserUsed: "Vision OCR",
    templateUsed: "fp-2048-b2",
    confidence: 81,
    claudeUsed: true,
    processingTime: "2.8s",
    result: "FAIL",
  },
  {
    id: 3,
    name: "West Warehouse Layout",
    supplier: "Legacy",
    expectedItems: 9,
    actualItems: 9,
    parserUsed: "Legacy Parser",
    templateUsed: "fp-3091-c3",
    confidence: 72,
    claudeUsed: false,
    processingTime: "0.9s",
    result: "PASS",
  },
]

export default function RegressionTestPage() {
  const [tests, setTests] = useState(mockRegressionTests)
  const [runningAll, setRunningAll] = useState(false)
  const [runningSelected, setRunningSelected] = useState<number | null>(null)

  const summary = useMemo(() => {
    const total = tests.length
    const passed = tests.filter((test) => test.result === "PASS").length
    const failed = total - passed
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0

    return { total, passed, failed, successRate }
  }, [tests])

  const runAllTests = () => {
    setRunningAll(true)

    window.setTimeout(() => {
      setTests((prev) => prev.map((test) => ({ ...test, result: test.result === "FAIL" ? "PASS" : test.result })))
      setRunningAll(false)
    }, 800)
  }

  const runSelectedTest = (testId: number) => {
    setRunningSelected(testId)

    window.setTimeout(() => {
      setTests((prev) => prev.map((test) => test.id === testId ? { ...test, result: "PASS" } : test))
      setRunningSelected(null)
    }, 600)
  }

  // TODO: Replace mock regression-test data with real backend results once an ADIE regression-test endpoint is available.

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Regression Test Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Monitor ADIE regression test outcomes with mock data for now.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Passed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">{summary.passed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-destructive">{summary.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.successRate}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                ADIE Regression Tests
              </CardTitle>
              <CardDescription className="mt-1">
                Review parser and template outcomes for the current regression suite.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={runAllTests} disabled={runningAll}>
                {runningAll ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Run All Tests
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Expected Items</TableHead>
                  <TableHead>Actual Items</TableHead>
                  <TableHead>Parser Used</TableHead>
                  <TableHead>Template Used</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Claude Used</TableHead>
                  <TableHead>Processing Time</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="font-medium">{test.name}</TableCell>
                    <TableCell>{test.supplier}</TableCell>
                    <TableCell>{test.expectedItems}</TableCell>
                    <TableCell>{test.actualItems}</TableCell>
                    <TableCell>{test.parserUsed}</TableCell>
                    <TableCell>{test.templateUsed}</TableCell>
                    <TableCell>{test.confidence}%</TableCell>
                    <TableCell>{test.claudeUsed ? "Yes" : "No"}</TableCell>
                    <TableCell>{test.processingTime}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${test.result === "PASS" ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
                        {test.result}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => runSelectedTest(test.id)} disabled={runningSelected === test.id}>
                        {runningSelected === test.id ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Run Selected Test
                      </Button>
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
