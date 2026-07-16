import * as React from "react"
import { useLocation } from "wouter"
import { 
  Building2, 
  Plus, 
  MapPin, 
  Clock, 
  Package, 
  Pencil,
  Trash2,
  Loader2
} from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { 
  useListDepots, 
  useCreateDepot,
  useUpdateDepot,
  useDeleteDepot,
  getListDepotsQueryKey,
  getGetStockSummaryQueryKey,
  getListStockQueryKey,
  useGetStockSummary,
  type Depot
} from "@workspace/api-client-react"
import { useAuth } from "@/contexts/auth"

const depotSchema = z.object({
  name: z.string().min(1, "Depot name is required").max(100),
  location: z.string().optional()
})

type DepotFormValues = z.infer<typeof depotSchema>

export default function DepotsList() {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [editingDepot, setEditingDepot] = React.useState<Depot | null>(null)
  const [deletingDepot, setDeletingDepot] = React.useState<Depot | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const { isAdmin } = useAuth()

  const { data: depots, isLoading: isLoadingDepots } = useListDepots()
  const { data: summary, isLoading: isLoadingSummary } = useGetStockSummary()
  
  const createDepot = useCreateDepot()
  const updateDepot = useUpdateDepot()
  const deleteDepot = useDeleteDepot()

  const createForm = useForm<DepotFormValues>({
    resolver: zodResolver(depotSchema),
    defaultValues: { name: "", location: "" }
  })

  const editForm = useForm<DepotFormValues>({
    resolver: zodResolver(depotSchema),
    defaultValues: { name: "", location: "" }
  })

  const onCreateSubmit = async (data: DepotFormValues) => {
    try {
      await createDepot.mutateAsync({ data })
      toast.success("Depot created successfully")
      setIsCreateOpen(false)
      createForm.reset()
      queryClient.invalidateQueries({ queryKey: getListDepotsQueryKey() })
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to create depot")
    }
  }

  const onEditSubmit = async (data: DepotFormValues) => {
    if (!editingDepot) return
    try {
      await updateDepot.mutateAsync({ id: editingDepot.id, data })
      toast.success("Depot updated")
      setEditingDepot(null)
      queryClient.invalidateQueries({ queryKey: getListDepotsQueryKey() })
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to update depot")
    }
  }

  const openEdit = (depot: Depot) => {
    editForm.reset({ name: depot.name, location: depot.location || "" })
    setEditingDepot(depot)
  }

  const confirmDelete = async () => {
    if (!deletingDepot) return
    setIsDeleting(true)
    try {
      await deleteDepot.mutateAsync({ id: deletingDepot.id })
      toast.success(`${deletingDepot.name} deleted`)
      setDeletingDepot(null)
      queryClient.invalidateQueries({ queryKey: getListDepotsQueryKey() })
      queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() })
      queryClient.invalidateQueries({ queryKey: getListStockQueryKey() })
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to delete depot")
    } finally {
      setIsDeleting(false)
    }
  }

  const isLoading = isLoadingDepots || isLoadingSummary

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Depots</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your warehouse locations and stock points.
          </p>
        </div>
        
        {isAdmin && (
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Depot
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mt-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-10 w-full mt-4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : depots?.length === 0 ? (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-1">No depots found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by adding your first depot location.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Depot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {depots?.map((depot) => {
            const depotSum = summary?.find(s => s.depotId === depot.id)
            return (
              <Card key={depot.id} className="flex flex-col group hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl font-bold flex items-center justify-between">
                    <span className="truncate pr-2">{depot.name}</span>
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(depot)}
                          title="Edit depot"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingDepot(depot)}
                          title="Delete depot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </CardTitle>
                  {depot.location && (
                    <CardDescription className="flex items-center gap-1.5 mt-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">{depot.location}</span>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1 pb-4 text-sm flex flex-col">
                  <div className="space-y-3 mb-6 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Package className="h-4 w-4" /> Total Items
                      </span>
                      <span className="font-semibold">{depotSum?.totalItems.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> Last Upload
                      </span>
                      <span className="font-medium text-xs">
                        {depot.lastUploadAt ? formatDate(depot.lastUploadAt) : "Never"}
                      </span>
                    </div>
                  </div>
                  
                  <div className={`grid gap-2 mt-auto ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setLocation(`/stock?depotId=${depot.id}`)}
                    >
                      View Stock
                    </Button>
                    {isAdmin && (
                      <Button 
                        variant="secondary" 
                        className="w-full"
                        onClick={() => setLocation(`/upload?depotId=${depot.id}`)}
                      >
                        Upload
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Depot Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Depot</DialogTitle>
            <DialogDescription>
              Create a new depot to start tracking stock.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Depot Name <span className="text-destructive">*</span></Label>
              <Input
                id="create-name"
                placeholder="e.g. Kochi Main Warehouse"
                {...createForm.register("name")}
                className={createForm.formState.errors.name ? "border-destructive" : ""}
              />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-location">Location</Label>
              <Input
                id="create-location"
                placeholder="e.g. Ernakulam"
                {...createForm.register("location")}
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Depot
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Depot Dialog */}
      <Dialog open={!!editingDepot} onOpenChange={(open) => !open && setEditingDepot(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Depot</DialogTitle>
            <DialogDescription>
              Update the name or location of this depot.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Depot Name <span className="text-destructive">*</span></Label>
              <Input
                id="edit-name"
                {...editForm.register("name")}
                className={editForm.formState.errors.name ? "border-destructive" : ""}
              />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                placeholder="e.g. Ernakulam"
                {...editForm.register("location")}
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setEditingDepot(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingDepot} onOpenChange={(open) => !open && setDeletingDepot(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Depot</DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deletingDepot?.name}</span> and all its stock data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setDeletingDepot(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Depot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
