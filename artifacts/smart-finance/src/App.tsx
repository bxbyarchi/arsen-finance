import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { AppLayout } from '@/components/layout/Shell';
import Dashboard from '@/pages/Dashboard';
import Debts from '@/pages/Debts';
import Expenses from '@/pages/Expenses';
import Income from '@/pages/Income';
import Crisis from '@/pages/Crisis';
import AIAdvisor from '@/pages/AIAdvisor';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/debts" component={Debts} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/income" component={Income} />
        <Route path="/crisis" component={Crisis} />
        <Route path="/ai" component={AIAdvisor} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
