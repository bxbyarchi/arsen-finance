import {
  useGetCrisisSimulation,
  useGetProfile,
  useUpdateProfile
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, AlertTriangle, ArrowRight, Zap, Target, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const fmt = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";

export default function CrisisSimulator() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile, isLoading: isLoadingProfile } = useGetProfile({ query: { queryKey: ["/api/profile"] }});
  const { data: simulation, isLoading: isLoadingSim } = useGetCrisisSimulation({ query: { queryKey: ["/api/crisis-simulation"] }});
  const updateProfile = useUpdateProfile();

  const handleCrisisToggle = (checked: boolean) => {
    updateProfile.mutate({ data: { crisisMode: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({
          title: checked ? "КРИЗИСНЫЙ РЕЖИМ ВКЛЮЧЁН" : "Обычный режим восстановлен",
          description: checked ? "Считаются только обязательные траты." : "Возврат к обычному режиму.",
          variant: checked ? "destructive" : "default",
        });
      }
    });
  };

  if (isLoadingProfile || isLoadingSim || !profile || !simulation) {
    return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const isCrisisActive = profile.crisisMode;
  const savingsGained = simulation.currentBurnRate - simulation.essentialBurnRate;
  const runwayGained = simulation.runwayMonthsCrisis - simulation.runwayMonthsFull;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Hero toggle */}
      <div className={`p-6 md:p-8 rounded-xl border-2 transition-all duration-500 ${isCrisisActive ? 'border-destructive bg-destructive/5' : 'border-border bg-card'}`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className={`p-4 rounded-full ${isCrisisActive ? 'bg-destructive/20' : 'bg-muted'}`}>
              <ShieldAlert className={`h-12 w-12 ${isCrisisActive ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">Режим выживания</h1>
              <p className="text-muted-foreground max-w-lg">
                Симулятор показывает, сколько вы протянете, если отказаться от всех необязательных трат. Включи — и сразу увидишь разницу.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Включить / Выключить</span>
            <Switch
              checked={isCrisisActive}
              onCheckedChange={handleCrisisToggle}
              className={`scale-150 data-[state=checked]:bg-destructive shadow-[0_0_20px_rgba(239,68,68,0.3)]`}
            />
            <span className={`text-xl font-black uppercase tracking-widest ${isCrisisActive ? 'text-destructive' : 'text-muted-foreground'}`}>
              {isCrisisActive ? 'Активен' : 'Выключен'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Трат сейчас</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold mb-1">{fmt(simulation.currentBurnRate)}</div>
            <div className="text-xs text-muted-foreground">При обычном режиме в месяц</div>
          </CardContent>
        </Card>

        <Card className={`border-2 ${isCrisisActive ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-destructive font-bold uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-3 w-3" /> Минимум для выживания
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold mb-1 text-destructive">{fmt(simulation.essentialBurnRate)}</div>
            <div className="text-xs text-emerald-500 font-medium">Экономия {fmt(savingsGained)} / мес</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Хватит сейчас</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-1">{simulation.runwayMonthsFull.toFixed(1)} <span className="text-lg font-normal text-muted-foreground">мес</span></div>
            <div className="text-xs text-muted-foreground">При обычных тратах</div>
          </CardContent>
        </Card>

        <Card className={`border-2 ${isCrisisActive ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
              <Target className="h-3 w-3" /> Хватит в режиме выживания
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-1 text-amber-500">{simulation.runwayMonthsCrisis.toFixed(1)} <span className="text-lg font-normal opacity-70">мес</span></div>
            <div className="text-xs text-emerald-500 font-medium">Ещё +{runwayGained.toFixed(1)} мес если урезать траты</div>
          </CardContent>
        </Card>
      </div>

      {/* Action plan + eliminable */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Что делать прямо сейчас
          </h2>
          <div className="space-y-4">
            {simulation.actionPlan.map((step, idx) => (
              <div key={idx} className="flex gap-4 p-4 border rounded-lg bg-card hover-elevate">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/20 text-destructive flex items-center justify-center font-black text-sm">
                  {step.priority}
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">{step.action}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {step.monthlySaving > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded text-xs font-bold">
                      <ArrowRight className="h-3 w-3" />
                      Экономия {fmt(step.monthlySaving)}/мес
                    </div>
                  )}
                </div>
              </div>
            ))}
            {simulation.actionPlan.length === 0 && (
              <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground">
                Срочных действий не требуется. Финансы стабильны.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" /> Что можно убрать
              </CardTitle>
              <CardDescription>Эти траты необязательны — можно сэкономить в кризис.</CardDescription>
            </CardHeader>
            <CardContent>
              {simulation.eliminableExpenses.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  Необязательных расходов не найдено.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Расход</TableHead>
                      <TableHead className="text-right">Экономия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulation.eliminableExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="font-medium text-muted-foreground line-through decoration-destructive/50">
                          {expense.name}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-500">
                          +{fmt(expense.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-bold">Итого сэкономишь</TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-500">
                        +{fmt(savingsGained)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {simulation.monthlyShortfall > 0 && (
            <div className="p-6 border-l-4 border-destructive bg-destructive/5 rounded-r-lg">
              <h3 className="text-destructive font-bold uppercase tracking-wider text-sm mb-2">⚠ Даже в режиме выживания — дефицит</h3>
              <div className="text-4xl font-black text-destructive mb-2">
                {fmt(simulation.monthlyShortfall)} <span className="text-lg font-medium opacity-70">не хватает/мес</span>
              </div>
              <p className="text-sm text-foreground/80">
                Даже убрав все необязательные траты, доходов всё равно не хватает. Нужно срочно найти дополнительный заработок или сократить обязательные расходы.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
