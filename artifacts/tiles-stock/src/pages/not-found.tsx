export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
      <p className="text-xl font-medium mb-6">Page not found</p>
      <p className="text-muted-foreground mb-8">The page you are looking for doesn't exist or has been moved.</p>
    </div>
  )
}
