import * as React from "react"
import { Link, useLocation } from "wouter"
import {
  Search,
  UploadCloud,
  Building2,
  LayoutDashboard,
  Menu,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth"

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const { user, isAdmin, logout } = useAuth()

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "User"
    : "User"

  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U"

  async function handleLogout() {
    await logout()
  }

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const isActive = location === href || (href !== "/" && location.startsWith(href))
    return (
      <Link
        href={href}
        onClick={() => setIsMobileMenuOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
        {label}
      </Link>
    )
  }

  return (
    <div className="flex min-h-[100dvh] w-full bg-background flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <img src="/shine-logo.jpg" alt="Shine Build Hub" className="h-7 w-7 rounded-md object-cover" />
          <span className="font-bold text-primary">Shine Build Hub</span>
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
            <img src="/shine-logo.jpg" alt="Shine Build Hub" className="h-8 w-8 rounded-lg object-cover" />
            <span>Shine Build Hub</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          <div className="mb-4 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Operations
          </div>

          <NavLink href="/" label="Dashboard" icon={LayoutDashboard} />
          <NavLink href="/stock" label="Stock Search" icon={Search} />
          <NavLink href="/depots" label="Depots" icon={Building2} />

          {isAdmin && (
            <>
              <div className="my-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Admin
              </div>
              <NavLink href="/upload" label="Upload Report" icon={UploadCloud} />
              <NavLink href="/users" label="Manage Users" icon={Users} />
            </>
          )}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={displayName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-xs leading-none truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {isAdmin ? (
                  <>
                    <ShieldCheck className="h-3 w-3 text-primary" />
                    <span className="text-primary font-medium">Admin</span>
                  </>
                ) : (
                  "Staff"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          <p className="mt-3 text-center text-[10px] text-muted-foreground/50 select-none">
            © {new Date().getFullYear()} Naushad Chungan
          </p>
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
