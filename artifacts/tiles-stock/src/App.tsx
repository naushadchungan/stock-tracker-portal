import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';
import { AuthProvider, useAuth } from '@/contexts/auth';

// Pages
import Dashboard from '@/pages/dashboard';
import StockSearch from '@/pages/stock';
import UploadReport from '@/pages/upload';
import DepotsList from '@/pages/depots';
import LoginPage from '@/pages/login';
import UsersPage from '@/pages/users';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/stock" component={StockSearch} />
        <Route path="/upload" component={UploadReport} />
        <Route path="/depots" component={DepotsList} />
        <Route path="/users" component={UsersPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </WouterRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
