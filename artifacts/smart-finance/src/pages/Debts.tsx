import { useState } from "react";
import { 
  useListDebts, 
  useCreateDebt, 
  useUpdateDebt, 
  useDeleteDebt, 
  useGetPayoffSchedules,
  Debt,
  DebtInput
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet, Plus, Trash2, Pencil, Calendar, ArrowRight, Percent, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const debtSchema = z.object({
  creditorName: z.string().min(1, "Required"),
  totalDebt: z.coerce.number().min(0, "Must be positive"),
  monthlyPayment: z.coerce.number().min(0, "Must be positive"),
  interestRate: z.coerce.number().min(0, "Must be positive"),
  dueDate: z.string().min(1, "Required"),
  notes: z.string().optional()
});

export default function Debts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: debts, isLoading: isLoadingDebts } = useListDebts({ query: { queryKey: ["/api/debts"] }});
  const { data: payoff, isLoading: isLoadingPayoff } = useGetPayoffSchedules({ query: { queryKey: ["/api/debts/payoff-schedules"] }});
  
  const createDebt = useCreateDebt();
  const updateDebt = useUpdateDebt();
  const deleteDebt = useDeleteDebt();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);

  const form = useForm<z.infer<typeof debtSchema>>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      creditorName: "",
      totalDebt: 0,
      monthlyPayment: 0,
      interestRate: 0,
      dueDate: "",
      notes: ""
    }
  });

  const handleOpenDialog = (debt?: Debt) => {
    if (debt) {
      setEditingDebt(debt);
      form.reset({
        creditorName: debt.creditorName,
        totalDebt: debt.totalDebt,
        monthlyPayment: debt.monthlyPayment,
        interestRate: debt.interestRate,
        dueDate: debt.dueDate,
        notes: debt.notes || ""
      });
    } else {
      setEditingDebt(null);
      form.reset({
        creditorName: "",
        totalDebt: 0,
        monthlyPayment: 0,
        interestRate: 0,
        dueDate: "",
        notes: ""
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof debtSchema>) => {
    if (editingDebt) {
      updateDebt.mutate({ id: editingDebt.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/debts/payoff-schedules"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          setIsDialogOpen(false);
          toast({ title: "Debt updated successfully" });
        }
      });
    } else {
      createDebt.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/debts/payoff-schedules"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          setIsDialogOpen(false);
          toast({ title: "Debt added successfully" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this debt?")) {
      deleteDebt.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/debts/payoff-schedules"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          toast({ title: "Debt removed" });
        }
      });
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (isLoadingDebts || isLoadingPayoff) {
    return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const isSnowballBetter = payoff && (payoff.snowballTotalInterest <= payoff.avalancheTotalInterest);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Debt Center</h1>
          <p className="text-muted-foreground mt-1">Manage liabilities and payoff strategies.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="hover-elevate font-bold uppercase tracking-wider">
          <Plus className="mr-2 h-4 w-4" /> Add Liability
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingDebt ? 'Update Liability' : 'New Liability'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <FormField
                control={form.control}
                name="creditorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Creditor / Institution</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Chase Bank" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="totalDebt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Balance</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="monthlyPayment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Min.</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="interestRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>APR (%)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createDebt.isPending || updateDebt.isPending}>
                  {editingDebt ? 'Update' : 'Save'} Liability
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {payoff && debts && debts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className={`border-2 ${isSnowballBetter ? 'border-emerald-500 bg-emerald-500/5' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Snowball Strategy 
                    {isSnowballBetter && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  </CardTitle>
                  <CardDescription>Smallest balances first</CardDescription>
                </div>
                {isSnowballBetter && <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-sm">Recommended</span>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-background p-3 rounded-md border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Time to Zero</div>
                  <div className="text-2xl font-bold">{payoff.snowballTotalMonths} <span className="text-sm font-normal text-muted-foreground">mos</span></div>
                </div>
                <div className="bg-background p-3 rounded-md border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Interest</div>
                  <div className="text-2xl font-bold text-destructive">{formatCurrency(payoff.snowballTotalInterest)}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Payoff Order</div>
                {payoff.snowball.map((p, i) => (
                  <div key={p.debtId} className="flex items-center text-sm border-b last:border-0 pb-2 last:pb-0">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold mr-3">{i + 1}</span>
                    <span className="font-medium flex-1">{p.creditorName}</span>
                    <span className="text-muted-foreground">{p.monthsToPayoff} mos</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={`border-2 ${!isSnowballBetter ? 'border-emerald-500 bg-emerald-500/5' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Avalanche Strategy
                    {!isSnowballBetter && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  </CardTitle>
                  <CardDescription>Highest interest first</CardDescription>
                </div>
                {!isSnowballBetter && <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-sm">Recommended</span>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-background p-3 rounded-md border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Time to Zero</div>
                  <div className="text-2xl font-bold">{payoff.avalancheTotalMonths} <span className="text-sm font-normal text-muted-foreground">mos</span></div>
                </div>
                <div className="bg-background p-3 rounded-md border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Interest</div>
                  <div className="text-2xl font-bold text-destructive">{formatCurrency(payoff.avalancheTotalInterest)}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Payoff Order</div>
                {payoff.avalanche.map((p, i) => (
                  <div key={p.debtId} className="flex items-center text-sm border-b last:border-0 pb-2 last:pb-0">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold mr-3">{i + 1}</span>
                    <span className="font-medium flex-1">{p.creditorName}</span>
                    <span className="text-muted-foreground">{p.monthsToPayoff} mos</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active Liabilities</CardTitle>
          <CardDescription>All your current debt obligations</CardDescription>
        </CardHeader>
        <CardContent>
          {debts?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No active liabilities recorded.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Creditor</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">APR</TableHead>
                    <TableHead className="text-right">Min Payment</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts?.map((debt) => (
                    <TableRow key={debt.id}>
                      <TableCell className="font-medium">{debt.creditorName}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">{formatCurrency(debt.totalDebt)}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className="flex items-center justify-end gap-1">
                          {debt.interestRate}% <Percent className="h-3 w-3 text-muted-foreground" />
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(debt.monthlyPayment)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Calendar className="h-3 w-3" />
                          {new Date(debt.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(debt)} className="h-8 w-8 hover:text-primary">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(debt.id)} className="h-8 w-8 hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
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