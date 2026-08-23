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
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Davlatov from '@/pages/Davlatov';
import Goals from '@/pages/Goals';
import Behavioral from '@/pages/Behavioral';
import Autonomy from '@/pages/Autonomy';
import Hypotheses from '@/pages/Hypotheses';
import { AuthGate } from '@/components/auth/AuthGate';

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
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/davlatov" component={Davlatov} />
        <Route path="/goals" component={Goals} />
        <Route path="/behavior" component={Behavioral} />
        <Route path="/autonomy" component={Autonomy} />
        <Route path="/hypotheses" component={Hypotheses} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </AuthGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
