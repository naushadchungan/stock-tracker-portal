import { Package, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth"

export default function LoginPage() {
  const { login } = useAuth()

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Package className="h-9 w-9 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">StockOps</h1>
            <p className="mt-1 text-sm text-muted-foreground">Kerala Operations · Tile Stock Manager</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-8 shadow-sm space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">
              Access the stock management portal
            </p>
          </div>

          <Button className="w-full gap-2 h-11 text-base" onClick={login}>
            <LogIn className="h-4 w-4" />
            Sign in
          </Button>

          <p className="text-xs text-muted-foreground">
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  )
}
