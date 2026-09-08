import { useState } from "react";
import {
  useListDebts,
  useCreateDebt,
  useUpdateDebt,
  useDeleteDebt,
  useGetPayoffSchedules,
  Debt,
  DebtInput,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  Plus,
  Trash2,
  Pencil,
  Calendar,
  Percent,
  CheckCircle2,
  CreditCard,
  History,
  ArrowUpCircle,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fmt = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";

const debtSchema = z.object({
  creditorName: z.string().min(1, "Обязательное поле"),
  originalAmount: z.coerce.number().min(0, "Должно быть положительным"),
  totalDebt: z.coerce.number().min(0, "Должно быть положительным"),
  termMonths: z.coerce.number().int().min(1, "Укажите срок кредита"),
  monthlyPayment: z.coerce.number().min(0, "Должно быть положительным"),
  interestRate: z.coerce.number().min(0, "Должно быть положительным"),
  dueDate: z.string().min(1, "Обязательное поле"),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Введите сумму больше нуля"),
  paymentType: z.enum(["monthly", "early", "full"]),
  paidAt: z.string().min(1, "Укажите дату"),
  notes: z.string().optional(),
});

type DebtWithLoan = Debt & {
  originalAmount?: number;
  termMonths?: number;
};

type DebtPayment = {
  id: number;
  amount: number;
  principalPaid: number;
  interestPaid: number;
  paymentType: "monthly" | "early" | "full" | string;
  paidAt: string;
  notes?: string | null;
};

export default function Debts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: debts, isLoading: isLoadingDebts } = useListDebts({ query: { queryKey: ["/api/debts"] } });
  const { data: payoff, isLoading: isLoadingPayoff } = useGetPayoffSchedules({ query: { queryKey: ["/api/debts/payoff-schedules"] } });

  const createDebt = useCreateDebt();
  const updateDebt = useUpdateDebt();
  const deleteDebt = useDeleteDebt();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtWithLoan | null>(null);
  const [paymentDebt, setPaymentDebt] = useState<DebtWithLoan | null>(null);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const form = useForm<z.infer<typeof debtSchema>>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      creditorName: "",
      originalAmount: 0,
      totalDebt: 0,
      termMonths: 12,
      monthlyPayment: 0,
      interestRate: 0,
      dueDate: "",
      notes: "",
    },
  });

  const paymentForm = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentType: "monthly",
      paidAt: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const refreshDebts = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/debts/payoff-schedules"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  };

  const handleOpenDialog = (debt?: DebtWithLoan) => {
    if (debt) {
      setEditingDebt(debt);
      form.reset({
        creditorName: debt.creditorName,
        originalAmount: debt.originalAmount || debt.totalDebt,
        totalDebt: debt.totalDebt,
        termMonths: debt.termMonths || 1,
        monthlyPayment: debt.monthlyPayment,
        interestRate: debt.interestRate,
        dueDate: debt.dueDate,
        notes: debt.notes || "",
      });
    } else {
      setEditingDebt(null);
      form.reset({
        creditorName: "",
        originalAmount: 0,
        totalDebt: 0,
        termMonths: 12,
        monthlyPayment: 0,
        interestRate: 0,
        dueDate: "",
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof debtSchema>) => {
    const payload = data as unknown as DebtInput;
    if (editingDebt) {
      updateDebt.mutate({ id: editingDebt.id, data: payload }, {
        onSuccess: () => {
          refreshDebts();
          setIsDialogOpen(false);
          toast({ title: "Долг обновлён" });
        },
      });
    } else {
      createDebt.mutate({ data: payload }, {
        onSuccess: () => {
          refreshDebts();
          setIsDialogOpen(false);
          toast({ title: "Долг добавлен" });
        },
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Удалить этот долг? История платежей тоже будет удалена.")) {
      deleteDebt.mutate({ id }, {
        onSuccess: () => {
          refreshDebts();
          toast({ title: "Долг удалён" });
        },
      });
    }
  };

  const loadPayments = async (debtId: number) => {
    setIsLoadingPayments(true);
    try {
      const response = await fetch(`/api/debts/${debtId}/payments`);
      if (!response.ok) throw new Error("Не удалось загрузить историю платежей");
      setPayments(await response.json());
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Ошибка загрузки истории", variant: "destructive" });
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const handleOpenPayment = (debt: DebtWithLoan) => {
    setPaymentDebt(debt);
    paymentForm.reset({
      amount: debt.monthlyPayment,
      paymentType: "monthly",
      paidAt: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    void loadPayments(debt.id);
  };

  const handlePaymentTypeChange = (type: "monthly" | "early" | "full") => {
    paymentForm.setValue("paymentType", type);
    if (!paymentDebt) return;
    if (type === "monthly") paymentForm.setValue("amount", paymentDebt.monthlyPayment);
    if (type === "full") paymentForm.setValue("amount", paymentDebt.totalDebt);
    if (type === "early") paymentForm.setValue("amount", 0);
  };

  const onPaymentSubmit = async (data: z.infer<typeof paymentSchema>) => {
    if (!paymentDebt) return;
    setIsSavingPayment(true);
    try {
      const response = await fetch(`/api/debts/${paymentDebt.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Не удалось записать платеж");

      refreshDebts();
      await loadPayments(paymentDebt.id);
      const newDebt = body?.debt;
      if (newDebt) setPaymentDebt((current) => current ? { ...current, ...newDebt } : current);
      paymentForm.reset({
        amount: data.paymentType === "monthly" ? paymentDebt.monthlyPayment : 0,
        paymentType: data.paymentType,
        paidAt: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      toast({ title: "Платёж записан", description: `Остаток: ${fmt(newDebt?.totalDebt ?? paymentDebt.totalDebt)}` });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Ошибка платежа", variant: "destructive" });
    } finally {
      setIsSavingPayment(false);
    }
  };

  if (isLoadingDebts || isLoadingPayoff) {
    return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const debtList = debts as DebtWithLoan[] | undefined;
  const isSnowballBetter = payoff && (payoff.snowballTotalInterest <= payoff.avalancheTotalInterest);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Мои долги</h1>
          <p className="text-muted-foreground mt-1">Следи за кредитами и гаси их умнее.</p>
        </div>
        <Button size="lg" onClick={() => handleOpenDialog()} className="hover-elevate font-semibold">
          <Plus className="mr-2 h-4 w-4" /> Добавить долг
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingDebt ? "Редактировать долг" : "Новый долг / кредит"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="creditorName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Банк / Кредитор</FormLabel>
                  <FormControl><Input {...field} placeholder="напр. Оптима Банк, МФО, рассрочка" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="originalAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сумма кредита (сом)</FormLabel>
                    <FormControl><Input type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="totalDebt" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Остаток долга (сом)</FormLabel>
                    <FormControl><Input type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="termMonths" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Срок кредита (месяцев)</FormLabel>
                    <FormControl><Input type="number" min="1" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="monthlyPayment" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Платёж в месяц (сом)</FormLabel>
                    <FormControl><Input type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="interestRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ставка (% годовых)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата следующего платежа</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Комментарий (необязательно)</FormLabel>
                  <FormControl><Input {...field} placeholder="напр. Ипотека, рассрочка, микрозайм" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end pt-2">
                <Button type="submit" size="lg" disabled={createDebt.isPending || updateDebt.isPending}>
                  {editingDebt ? "Сохранить изменения" : "Добавить долг"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentDebt)} onOpenChange={(open) => !open && setPaymentDebt(null)}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Погашение: {paymentDebt?.creditorName}
            </DialogTitle>
          </DialogHeader>
          {paymentDebt && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Остаток</div>
                  <div className="text-xl font-bold text-destructive">{fmt(paymentDebt.totalDebt)}</div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Платёж/мес</div>
                  <div className="text-xl font-bold">{fmt(paymentDebt.monthlyPayment)}</div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Ставка</div>
                  <div className="text-xl font-bold">{paymentDebt.interestRate}%</div>
                </div>
              </div>

              <Form {...paymentForm}>
                <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4">
                  <FormField control={paymentForm.control} name="paymentType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип платежа</FormLabel>
                      <div className="grid grid-cols-3 gap-2">
                        <Button type="button" variant={field.value === "monthly" ? "default" : "outline"} onClick={() => handlePaymentTypeChange("monthly")}>
                          <Calendar className="mr-2 h-4 w-4" /> Ежемесячный
                        </Button>
                        <Button type="button" variant={field.value === "early" ? "default" : "outline"} onClick={() => handlePaymentTypeChange("early")}>
                          <Zap className="mr-2 h-4 w-4" /> Досрочный
                        </Button>
                        <Button type="button" variant={field.value === "full" ? "default" : "outline"} onClick={() => handlePaymentTypeChange("full")}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Закрыть
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={paymentForm.control} name="amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сумма платежа (сом)</FormLabel>
                        <FormControl><Input type="number" min="1" step="1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={paymentForm.control} name="paidAt" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дата платежа</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={paymentForm.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Комментарий</FormLabel>
                      <FormControl><Input {...field} placeholder="например: досрочно внесено из накоплений" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={isSavingPayment}>
                      <ArrowUpCircle className="mr-2 h-4 w-4" /> Записать платёж
                    </Button>
                  </div>
                </form>
              </Form>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <History className="h-4 w-4" />
                  <h3 className="font-semibold">История платежей</h3>
                </div>
                {isLoadingPayments ? (
                  <Skeleton className="h-24 w-full" />
                ) : payments.length === 0 ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Платежей пока нет.</div>
                ) : (
                  <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                    {payments.map((payment) => (
                      <div key={payment.id} className="p-3 flex items-center justify-between gap-4 text-sm">
                        <div>
                          <div className="font-medium">
                            {payment.paymentType === "monthly" ? "Ежемесячный платёж" : payment.paymentType === "early" ? "Досрочное погашение" : "Полное погашение"}
                          </div>
                          <div className="text-xs text-muted-foreground">{new Date(payment.paidAt).toLocaleDateString("ru-RU")} {payment.notes ? `· ${payment.notes}` : ""}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-semibold">{fmt(payment.amount)}</div>
                          <div className="text-xs text-muted-foreground">тело {fmt(payment.principalPaid)} · проценты {fmt(payment.interestPaid)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {payoff && debtList && debtList.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className={`border-2 ${isSnowballBetter ? "border-emerald-500 bg-emerald-500/5" : "border-border"}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">Метод снежного кома {isSnowballBetter && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}</CardTitle>
                  <CardDescription>Сначала гасим меньший долг — быстрее видишь результат</CardDescription>
                </div>
                {isSnowballBetter && <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-sm">Рекомендуется</span>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-background p-3 rounded-md border"><div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Срок погашения</div><div className="text-2xl font-bold">{payoff.snowballTotalMonths} <span className="text-sm font-normal text-muted-foreground">мес</span></div></div>
                <div className="bg-background p-3 rounded-md border"><div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Переплата</div><div className="text-2xl font-bold text-destructive">{fmt(payoff.snowballTotalInterest)}</div></div>
              </div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Порядок погашения</div>
              {payoff.snowball.map((p, i) => <div key={p.debtId} className="flex items-center text-sm border-b last:border-0 pb-2 last:pb-0"><span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold mr-3">{i + 1}</span><span className="font-medium flex-1">{p.creditorName}</span><span className="text-muted-foreground">{p.monthsToPayoff} мес</span></div>)}
            </CardContent>
          </Card>

          <Card className={`border-2 ${!isSnowballBetter ? "border-emerald-500 bg-emerald-500/5" : "border-border"}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">Метод лавины {!isSnowballBetter && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}</CardTitle>
                  <CardDescription>Сначала гасим долг с самой высокой ставкой — меньше переплата</CardDescription>
                </div>
                {!isSnowballBetter && <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-sm">Рекомендуется</span>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-background p-3 rounded-md border"><div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Срок погашения</div><div className="text-2xl font-bold">{payoff.avalancheTotalMonths} <span className="text-sm font-normal text-muted-foreground">мес</span></div></div>
                <div className="bg-background p-3 rounded-md border"><div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Переплата</div><div className="text-2xl font-bold text-destructive">{fmt(payoff.avalancheTotalInterest)}</div></div>
              </div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Порядок погашения</div>
              {payoff.avalanche.map((p, i) => <div key={p.debtId} className="flex items-center text-sm border-b last:border-0 pb-2 last:pb-0"><span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold mr-3">{i + 1}</span><span className="font-medium flex-1">{p.creditorName}</span><span className="text-muted-foreground">{p.monthsToPayoff} мес</span></div>)}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Все кредиты и долги</CardTitle>
          <CardDescription>Теперь платежи можно записывать отдельно — остаток и прогноз погашения пересчитываются автоматически.</CardDescription>
        </CardHeader>
        <CardContent>
          {debtList?.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground"><Wallet className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="text-base">Долгов не записано. Добавьте первый!</p></div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Банк / Кредитор</TableHead>
                    <TableHead className="text-right">Остаток</TableHead>
                    <TableHead className="text-right">Ставка</TableHead>
                    <TableHead className="text-right">Платёж/мес</TableHead>
                    <TableHead className="text-right">Срок</TableHead>
                    <TableHead>Дата платежа</TableHead>
                    <TableHead className="w-[145px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtList?.map((debt) => (
                    <TableRow key={debt.id}>
                      <TableCell className="font-medium">{debt.creditorName}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">{fmt(debt.totalDebt)}</TableCell>
                      <TableCell className="text-right font-mono"><span className="flex items-center justify-end gap-1">{debt.interestRate}% <Percent className="h-3 w-3 text-muted-foreground" /></span></TableCell>
                      <TableCell className="text-right font-mono">{fmt(debt.monthlyPayment)}</TableCell>
                      <TableCell className="text-right font-mono">{debt.termMonths ? `${debt.termMonths} мес` : "—"}</TableCell>
                      <TableCell><span className="flex items-center gap-2 text-muted-foreground text-sm"><Calendar className="h-3 w-3" />{new Date(debt.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenPayment(debt)} className="h-8 w-8 hover:text-primary" title="Погашение"><CreditCard className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(debt)} className="h-8 w-8 hover:text-primary" title="Редактировать"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(debt.id)} className="h-8 w-8 hover:text-destructive" title="Удалить"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
