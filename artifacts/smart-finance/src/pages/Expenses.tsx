import { useState } from "react";
import {
  useListExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense, useGetBurnRate,
  Expense, ExpenseCategory, ExpenseInputCategory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Receipt, Plus, Trash2, Pencil, Home, Utensils, Car, Zap, HeartPulse, MoreHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

const fmt = (val: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";
const expenseSchema = z.object({
  category: z.nativeEnum(ExpenseInputCategory),
  name: z.string().min(1, "Обязательное поле"),
  amount: z.coerce.number().min(0.01, "Должно быть положительным"),
  frequency: z.enum(["daily", "monthly"]),
  isEssential: z.boolean(),
});

const CATEGORY_ICONS: Record<string, any> = { housing: Home, food: Utensils, transport: Car, utilities: Zap, health: HeartPulse, miscellaneous: MoreHorizontal };
const CATEGORY_COLORS: Record<string, string> = { housing: "hsl(var(--primary))", food: "hsl(var(--chart-2))", transport: "hsl(var(--chart-3))", utilities: "hsl(var(--chart-4))", health: "hsl(var(--chart-5))", miscellaneous: "hsl(var(--muted-foreground))" };
const CATEGORY_NAMES: Record<string, string> = { housing: "Жильё", food: "Питание", transport: "Транспорт", utilities: "Коммунальные / Связь", health: "Здоровье", miscellaneous: "Разное" };

type ExpenseWithFrequency = Expense & { frequency?: "daily" | "monthly" };

export default function Expenses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: expenses, isLoading: isLoadingExpenses } = useListExpenses({ query: { queryKey: ["/api/expenses"] } });
  const { data: burnRate, isLoading: isLoadingBurnRate } = useGetBurnRate({ query: { queryKey: ["/api/expenses/burn-rate"] } });
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithFrequency | null>(null);
  const [filterEssentialOnly, setFilterEssentialOnly] = useState(false);

  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: "miscellaneous", name: "", amount: 0, frequency: "monthly", isEssential: false },
  });

  const handleOpenDialog = (expense?: Expense) => {
    if (expense) {
      const item = expense as ExpenseWithFrequency;
      setEditingExpense(item);
      form.reset({ category: item.category, name: item.name, amount: item.amount, frequency: item.frequency ?? "monthly", isEssential: item.isEssential });
    } else {
      setEditingExpense(null);
      form.reset({ category: "miscellaneous", name: "", amount: 0, frequency: "monthly", isEssential: false });
    }
    setIsDialogOpen(true);
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/expenses/burn-rate"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/detailed"] });
  };

  const onSubmit = (data: z.infer<typeof expenseSchema>) => {
    if (editingExpense) {
      updateExpense.mutate({ id: editingExpense.id, data }, { onSuccess: () => { invalidateAll(); setIsDialogOpen(false); toast({ title: "Расход обновлён" }); } });
    } else {
      createExpense.mutate({ data }, { onSuccess: () => { invalidateAll(); setIsDialogOpen(false); toast({ title: "Расход добавлен и списан с баланса" }); } });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Удалить этот расход и вернуть сумму на баланс?")) return;
    deleteExpense.mutate({ id }, { onSuccess: () => { invalidateAll(); toast({ title: "Расход удалён, сумма возвращена на баланс" }); } });
  };

  if (isLoadingExpenses || isLoadingBurnRate) return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const chartData = burnRate?.byCategory.map(c => ({ name: CATEGORY_NAMES[c.category] || c.category, value: c.total, color: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.miscellaneous })) || [];
  const filteredExpenses = (expenses as ExpenseWithFrequency[] | undefined)?.filter(e => filterEssentialOnly ? e.isEssential : true) || [];
  const selectedFrequency = form.watch("frequency");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight">Мои расходы</h1><p className="text-muted-foreground mt-1">Фактические списания и план регулярных трат — в одном месте.</p></div>
        <Button size="lg" onClick={() => handleOpenDialog()} className="hover-elevate font-semibold"><Plus className="mr-2 h-4 w-4" /> Добавить расход</Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editingExpense ? "Редактировать расход" : "Новый расход"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Название</FormLabel><FormControl><Input {...field} placeholder="Продукты, бензин, аренда…" /></FormControl><FormMessage /></FormItem>} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => <FormItem><FormLabel>{selectedFrequency === "daily" ? "Сумма в день (сом)" : "Сумма в месяц (сом)"}</FormLabel><FormControl><Input type="number" min="0.01" step="1" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="frequency" render={({ field }) => <FormItem><FormLabel>Периодичность</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="daily">Ежедневный</SelectItem><SelectItem value="monthly">Ежемесячный</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
              </div>
              <FormField control={form.control} name="category" render={({ field }) => <FormItem><FormLabel>Категория</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger></FormControl><SelectContent>{Object.values(ExpenseCategory).map(cat => <SelectItem key={cat} value={cat}>{CATEGORY_NAMES[cat] || cat}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="isEssential" render={({ field }) => <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/20"><div><FormLabel className="text-base font-bold text-destructive">Обязательный расход?</FormLabel><p className="text-sm text-muted-foreground mt-0.5">Жильё, еда, транспорт — без него нельзя обойтись.</p></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-destructive" /></FormControl></FormItem>} />
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Ежедневная трата списывается с баланса один раз на введённую сумму, а в месячной аналитике автоматически считается как ×30.</div>
              <div className="flex justify-end pt-2"><Button type="submit" size="lg" disabled={createExpense.isPending || updateExpense.isPending}>{editingExpense ? "Сохранить" : "Добавить"}</Button></div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {burnRate && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-2 border-primary/20 md:col-span-2"><CardHeader className="pb-2"><CardTitle>Месячный эквивалент трат</CardTitle><CardDescription>Ежедневные расходы ×30 + ежемесячные</CardDescription></CardHeader><CardContent><div className="text-4xl font-bold mb-6">{fmt(burnRate.totalMonthly)}</div><div className="grid grid-cols-2 gap-4"><div className="p-4 rounded-md bg-destructive/10 border border-destructive/20"><div className="text-xs font-bold text-destructive uppercase tracking-wider mb-1">Обязательные</div><div className="text-2xl font-mono">{fmt(burnRate.essentialTotal)}</div><div className="text-xs text-muted-foreground mt-1">{(burnRate.essentialTotal / burnRate.totalMonthly * 100 || 0).toFixed(0)}% от всего</div></div><div className="p-4 rounded-md bg-muted border"><div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Необязательные</div><div className="text-2xl font-mono">{fmt(burnRate.variableTotal)}</div><div className="text-xs text-muted-foreground mt-1">{(burnRate.variableTotal / burnRate.totalMonthly * 100 || 0).toFixed(0)}% от всего</div></div></div><div className="mt-4 text-sm text-muted-foreground">Средний дневной темп: <span className="font-semibold text-foreground">{fmt(burnRate.totalDaily ?? burnRate.totalMonthly / 30)}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-0"><CardTitle className="text-sm">По категориям</CardTitle></CardHeader><CardContent className="h-[250px] p-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Pie><RechartsTooltip formatter={(value: number) => fmt(value)} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} /></PieChart></ResponsiveContainer></CardContent></Card>
      </div>}

      <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Все расходы</CardTitle><CardDescription>Фактическая сумма списывается с текущего баланса. Клик по карандашу — редактирование.</CardDescription></div><div className="flex items-center gap-2"><span className="text-sm font-medium">Только обязательные</span><Switch checked={filterEssentialOnly} onCheckedChange={setFilterEssentialOnly} /></div></CardHeader><CardContent>
        {filteredExpenses.length === 0 ? <div className="text-center py-10 text-muted-foreground"><Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="text-base">Расходов не записано. Добавьте первый!</p></div> :
          <div className="rounded-md border overflow-x-auto"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead>Категория</TableHead><TableHead>Название</TableHead><TableHead>Тип</TableHead><TableHead>Период</TableHead><TableHead className="text-right">Сумма</TableHead><TableHead className="w-[90px]" /></TableRow></TableHeader><TableBody>
            {filteredExpenses.map(expense => { const Icon = CATEGORY_ICONS[expense.category] || CATEGORY_ICONS.miscellaneous; const daily = expense.frequency === "daily"; return <TableRow key={expense.id}><TableCell><div className="flex items-center gap-2"><div className="p-1.5 rounded bg-muted"><Icon className="h-4 w-4" style={{ color: CATEGORY_COLORS[expense.category] }} /></div><span className="font-medium">{CATEGORY_NAMES[expense.category] || expense.category}</span></div></TableCell><TableCell>{expense.name}</TableCell><TableCell><div className="flex flex-wrap gap-1">{expense.isEssential ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-destructive/10 text-destructive">Обязательный</span> : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-muted text-muted-foreground">Необязательный</span>}{expense.emotionalTrigger && expense.emotionalTrigger !== "routine" && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-violet-500/10 text-violet-400">{expense.emotionalTrigger === "stress_buying" ? "Эмоциональная" : expense.emotionalTrigger === "status_validation" ? "Статус" : "Удобство"}</span>}{expense.isImpulseBuy && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-500">Импульс</span>}</div></TableCell><TableCell><span className="text-xs font-semibold">{daily ? "Каждый день" : "Каждый месяц"}</span></TableCell><TableCell className="text-right font-mono font-medium">{fmt(expense.amount)} <span className="text-xs text-muted-foreground">/ {daily ? "день" : "мес"}</span></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => handleOpenDialog(expense)} className="h-8 w-8 hover:text-primary"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)} className="h-8 w-8 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>; })}
          </TableBody></Table></div>}
      </CardContent></Card>
    </div>
  );
}
