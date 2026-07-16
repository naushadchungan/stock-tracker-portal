import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Trash2, ShieldCheck, User, Loader2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
  type UserRecord,
} from "@workspace/api-client-react"
import { useAuth } from "@/contexts/auth"

type RoleValue = "admin" | "user"

function RoleBadge({ role }: { role: string }) {
  return role === "admin" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <ShieldCheck className="h-3 w-3" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <User className="h-3 w-3" /> User
    </span>
  )
}

interface UserFormState {
  username: string
  password: string
  role: RoleValue
  firstName: string
  lastName: string
  email: string
}

const emptyForm = (): UserFormState => ({
  username: "",
  password: "",
  role: "user",
  firstName: "",
  lastName: "",
  email: "",
})

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading } = useListUsers()
  const users = data?.users ?? []

  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const deleteMutation = useDeleteUser()

  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<UserRecord | null>(null)
  const [deletingUser, setDeletingUser] = React.useState<UserRecord | null>(null)
  const [form, setForm] = React.useState<UserFormState>(emptyForm())

  function openCreate() {
    setForm(emptyForm())
    setIsCreateOpen(true)
  }

  function openEdit(u: UserRecord) {
    setForm({
      username: u.username,
      password: "",
      role: (u.role as RoleValue) || "user",
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      email: u.email ?? "",
    })
    setEditingUser(u)
  }

  function updateForm(field: keyof UserFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await createMutation.mutateAsync(
      {
        data: {
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          email: form.email || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(`User "${form.username}" created`)
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
          setIsCreateOpen(false)
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          toast.error(msg ?? "Failed to create user")
        },
      },
    )
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    await updateMutation.mutateAsync(
      {
        id: editingUser.id,
        data: {
          role: form.role,
          password: form.password || undefined,
          email: form.email || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("User updated")
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
          setEditingUser(null)
        },
        onError: () => toast.error("Failed to update user"),
      },
    )
  }

  async function handleDelete() {
    if (!deletingUser) return
    await deleteMutation.mutateAsync(
      { id: deletingUser.id },
      {
        onSuccess: () => {
          toast.success(`User "${deletingUser.username}" deleted`)
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
          setDeletingUser(null)
        },
        onError: () => toast.error("Failed to delete user"),
      },
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage staff accounts and roles</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            No users found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3 hidden sm:table-cell">Name</th>
                <th className="px-4 py-3 hidden md:table-cell">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.username}
                    {u.id === currentUser?.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {u.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => openEdit(u)}
                      >
                        <KeyRound className="h-3 w-3" />
                        Edit
                      </Button>
                      {u.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingUser(u)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="new-username">Username *</Label>
                <Input
                  id="new-username"
                  value={form.username}
                  onChange={(e) => updateForm("username", e.target.value)}
                  placeholder="e.g. john"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="new-password">Password *</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  placeholder="Set a password"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => updateForm("role", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User — read-only access</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-first">First Name</Label>
                <Input
                  id="new-first"
                  value={form.firstName}
                  onChange={(e) => updateForm("firstName", e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-last">Last Name</Label>
                <Input
                  id="new-last"
                  value={form.lastName}
                  onChange={(e) => updateForm("lastName", e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
                ) : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User — {editingUser?.username}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => updateForm("role", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User — read-only access</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="edit-password">New Password</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-first">First Name</Label>
                <Input
                  id="edit-first"
                  value={form.firstName}
                  onChange={(e) => updateForm("firstName", e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-last">Last Name</Label>
                <Input
                  id="edit-last"
                  value={form.lastName}
                  onChange={(e) => updateForm("lastName", e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                ) : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingUser?.username}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
