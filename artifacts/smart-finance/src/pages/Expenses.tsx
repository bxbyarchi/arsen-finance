import { useState } from "react";
import {
  useListExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useGetBurnRate,
  Expense,
  ExpenseCategory,
  ExpenseInputCategory
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

const fmt = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";

const expenseSchema = z.object({
  category: z.nativeEnum(ExpenseInputCategory),
  name: z.string().min(1, "Обязательное поле"),
  amount: z.coerce.number().min(0.01, "Должно быть положительным"),
  isEssential: z.boolean()
});

const CATEGORY_ICONS: Record<string, any> = {
  housing: Home, food: Utensils, transport: Car, utilities: Zap, health: HeartPulse, miscellaneous: MoreHorizontal
};
const CATEGORY_COLORS: Record<string, string> = {
  housing: "hsl(var(--primary))", food: "hsl(var(--chart-2))", transport: "hsl(var(--chart-3))",
  utilities: "hsl(var(--chart-4))", health: "hsl(var(--chart-5))", miscellaneous: "hsl(var(--muted-foreground))"
};
const CATEGORY_NAMES: Record<string, string> = {
  housing: "Жильё", food: "Питание", transport: "Транспорт",
  utilities: "Коммунальные / Связь", health: "Здоровье", miscellaneous: "Разное"
};

export default function Expenses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: expenses, isLoading: isLoadingExpenses } = useListExpenses({ query: { queryKey: ["/api/expenses"] }});
  const { data: burnRate, isLoading: isLoadingBurnRate } = useGetBurnRate({ query: { queryKey: ["/api/expenses/burn-rate"] }});

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterEssentialOnly, setFilterEssentialOnly] = useState(false);

  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: "miscellaneous", name: "", amount: 0, isEssential: false }
  });

  const handleOpenDialog = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      form.reset({ category: expense.category, name: expense.name, amount: expense.amount, isEssential: expense.isEssential });
    } else {
      setEditingExpense(null);
      form.reset({ category: "miscellaneous", name: "", amount: 0, isEssential: false });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof expenseSchema>) => {
    if (editingExpense) {
      updateExpense.mutate({ id: editingExpense.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
          queryClient.invalidateQueries({ queryKey: ["/api/expenses/burn-rate"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          setIsDialogOpen(false);
          toast({ title: "Расход обновлён" });
        }
      });
    } else {
      createExpense.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
          queryClient.invalidateQueries({ queryKey: ["/api/expenses/burn-rate"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          setIsDialogOpen(false);
          toast({ title: "Расход добавлен" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Удалить этот расход?")) {
      deleteExpense.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
          queryClient.invalidateQueries({ queryKey: ["/api/expenses/burn-rate"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          toast({ title: "Расход удалён" });
        }
      });
    }
  };

  if (isLoadingExpenses || isLoadingBurnRate) {
    return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const chartData = burnRate?.byCategory.map(c => ({
    name: CATEGORY_NAMES[c.category] || c.category,
    value: c.total,
    color: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.miscellaneous
  })) || [];

  const filteredExpenses = expenses?.filter(e => filterEssentialOnly ? e.isEssential : true) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Мои расходы</h1>
          <p className="text-muted-foreground mt-1">Все траты — в одном месте.</p>
        </div>
        <Button size="lg" onClick={() => handleOpenDialog()} className="hover-elevate font-semibold">
          <Plus className="mr-2 h-4 w-4" /> Добавить расход
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Редактировать расход' : 'Новый расход'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl><Input {...field} placeholder="напр. Аренда, Продукты, Бензин" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сумма в месяц (сом)</FormLabel>
                    <FormControl><Input type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ExpenseCategory).map(cat => (
                          <SelectItem key={cat} value={cat}>{CATEGORY_NAMES[cat] || cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="isEssential" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/20">
                  <div>
                    <FormLabel className="text-base font-bold text-destructive">Обязательный расход?</FormLabel>
                    <p className="text-sm text-muted-foreground mt-0.5">Жильё, еда, транспорт — без него не выжить.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-destructive" />
                  </FormControl>
                </FormItem>
              )} />
              <div className="flex justify-end pt-2">
                <Button type="submit" size="lg" disabled={createExpense.isPending || updateExpense.isPending}>
                  {editingExpense ? 'Сохранить' : 'Добавить'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {burnRate && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 border-primary/20 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle>Сумма трат за месяц</CardTitle>
              <CardDescription>Итого всех расходов</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-6">{fmt(burnRate.totalMonthly)}</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
                  <div className="text-xs font-bold text-destructive uppercase tracking-wider mb-1">Обязательные</div>
                  <div className="text-2xl font-mono">{fmt(burnRate.essentialTotal)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{(burnRate.essentialTotal / burnRate.totalMonthly * 100 || 0).toFixed(0)}% от всего</div>
                </div>
                <div className="p-4 rounded-md bg-muted border">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Необязательные</div>
                  <div className="text-2xl font-mono">{fmt(burnRate.variableTotal)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{(burnRate.variableTotal / burnRate.totalMonthly * 100 || 0).toFixed(0)}% от всего</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">По категориям</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => fmt(value)}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Все расходы</CardTitle>
            <CardDescription>Нажмите карандаш для редактирования</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Только обязательные</span>
            <Switch checked={filterEssentialOnly} onCheckedChange={setFilterEssentialOnly} />
          </div>
        </CardHeader>
        <CardContent>
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-base">Расходов не записано. Добавьте первый!</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Категория</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead className="text-right">Сумма/мес</TableHead>
                    <TableHead className="w-[90px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => {
                    const Icon = CATEGORY_ICONS[expense.category] || CATEGORY_ICONS.miscellaneous;
                    return (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded bg-muted">
                              <Icon className="h-4 w-4" style={{ color: CATEGORY_COLORS[expense.category] }} />
                            </div>
                            <span className="font-medium">{CATEGORY_NAMES[expense.category] || expense.category}</span>
                          </div>
                        </TableCell>
                        <TableCell>{expense.name}</TableCell>
                        <TableCell>
                          {expense.isEssential
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-destructive/10 text-destructive">Обязательный</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-muted text-muted-foreground">Необязательный</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">{fmt(expense.amount)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(expense)} className="h-8 w-8 hover:text-primary">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)} className="h-8 w-8 hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
