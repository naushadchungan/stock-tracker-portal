import * as React from "react"
import { Link, useLocation } from "wouter"
import { Package, Search, UploadCloud, Building2, LayoutDashboard, Settings, Menu } from "lucide-react"
import { cn } from "@/lib/utils"

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/stock", label: "Stock Search", icon: Search },
    { href: "/upload", label: "Upload Report", icon: UploadCloud },
    { href: "/depots", label: "Depots", icon: Building2 },
  ]

  return (
    <div className="flex min-h-[100dvh] w-full bg-background flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <div className="flex items-center gap-2 font-bold text-primary">
          <Package className="h-6 w-6" />
          <span>StockOps</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 ease-in-out md:static md:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 md:h-16 items-center px-6 border-b border-border/50">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary tracking-tight">
            <Package className="h-6 w-6" />
            <span>StockOps</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          <div className="mb-4 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Operations
          </div>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-foreground font-bold">
              K
            </div>
            <div>
              <p className="font-semibold text-foreground text-xs leading-none">Kerala Operations</p>
              <p className="text-xs mt-1">Staff Portal</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
