import { useState } from "react";
import { 
  useListIncomes, 
  useCreateIncome, 
  useUpdateIncome, 
  useDeleteIncome,
  useGetProjectionSummary,
  Income,
  IncomeConfidence,
  IncomeInputConfidence
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Plus, Trash2, Pencil, Calendar, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const incomeSchema = z.object({
  source: z.string().min(1, "Required"),
  projectedAmount: z.coerce.number().min(0, "Must be positive"),
  actualAmount: z.coerce.number().optional(),
  confidence: z.nativeEnum(IncomeInputConfidence),
  month: z.string().min(1, "Required").regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM"),
  notes: z.string().optional()
});

export default function IncomePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: incomes, isLoading: isLoadingIncomes } = useListIncomes({ query: { queryKey: ["/api/incomes"] }});
  const { data: summary, isLoading: isLoadingSummary } = useGetProjectionSummary({ query: { queryKey: ["/api/incomes/summary"] }});
  
  const createIncome = useCreateIncome();
  const updateIncome = useUpdateIncome();
  const deleteIncome = useDeleteIncome();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const form = useForm<z.infer<typeof incomeSchema>>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      source: "",
      projectedAmount: 0,
      confidence: "MEDIUM",
      month: currentMonth,
      notes: ""
    }
  });

  const handleOpenDialog = (income?: Income) => {
    if (income) {
      setEditingIncome(income);
      form.reset({
        source: income.source,
        projectedAmount: income.projectedAmount,
        actualAmount: income.actualAmount || undefined,
        confidence: income.confidence,
        month: income.month,
        notes: income.notes || ""
      });
    } else {
      setEditingIncome(null);
      form.reset({
        source: "",
        projectedAmount: 0,
        actualAmount: undefined,
        confidence: "MEDIUM",
        month: currentMonth,
        notes: ""
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof incomeSchema>) => {
    if (editingIncome) {
      updateIncome.mutate({ id: editingIncome.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
          queryClient.invalidateQueries({ queryKey: ["/api/incomes/summary"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          setIsDialogOpen(false);
          toast({ title: "Income source updated" });
        }
      });
    } else {
      createIncome.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
          queryClient.invalidateQueries({ queryKey: ["/api/incomes/summary"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          setIsDialogOpen(false);
          toast({ title: "Income source added" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this income entry?")) {
      deleteIncome.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
          queryClient.invalidateQueries({ queryKey: ["/api/incomes/summary"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          toast({ title: "Income removed" });
        }
      });
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "HIGH": return <Badge className="bg-emerald-500 text-white font-bold uppercase text-[10px] px-2 py-0.5 border-none">High</Badge>;
      case "MEDIUM": return <Badge className="bg-amber-500 text-white font-bold uppercase text-[10px] px-2 py-0.5 border-none">Med</Badge>;
      case "LOW": return <Badge className="bg-destructive text-white font-bold uppercase text-[10px] px-2 py-0.5 border-none">Low</Badge>;
      default: return null;
    }
  };

  if (isLoadingIncomes || isLoadingSummary) {
    return <div className="space-y-6"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const gapIsPositive = (summary?.incomeVsExpenseGap ?? 0) >= 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue Streams</h1>
          <p className="text-muted-foreground mt-1">Projected and actual income tracking.</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="hover-elevate font-bold uppercase tracking-wider">
          <Plus className="mr-2 h-4 w-4" /> Add Revenue
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingIncome ? 'Update Revenue' : 'New Revenue Source'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Acme Corp Salary" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Month (YYYY-MM)</FormLabel>
                      <FormControl><Input type="month" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confidence"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confidence</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="HIGH">High (90%+)</SelectItem>
                          <SelectItem value="MEDIUM">Medium (50-90%)</SelectItem>
                          <SelectItem value="LOW">Low (&lt;50%)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="projectedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Projected</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="actualAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual (If realized)</FormLabel>
                      <FormControl><Input type="number" step="0.01" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createIncome.isPending || updateIncome.isPending}>
                  {editingIncome ? 'Update' : 'Save'} Revenue
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Projected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-1">{formatCurrency(summary.totalProjected)}</div>
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Raw expectation</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-emerald-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-emerald-500 flex items-center gap-2">
                Risk-Adjusted Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-1 text-emerald-500">{formatCurrency(summary.confidenceWeightedProjected)}</div>
              <div className="text-xs text-muted-foreground">Weighted by confidence levels</div>
            </CardContent>
          </Card>

          <Card className={`border-2 ${gapIsPositive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-destructive/20 bg-destructive/5'}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium uppercase tracking-wider flex items-center gap-2 ${gapIsPositive ? 'text-emerald-500' : 'text-destructive'}`}>
                Surplus / Deficit
                {gapIsPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold mb-1 ${gapIsPositive ? 'text-emerald-500' : 'text-destructive'}`}>
                {gapIsPositive ? "+" : ""}{formatCurrency(summary.incomeVsExpenseGap)}
              </div>
              <div className="text-xs text-muted-foreground">Risk-adjusted vs monthly expenses</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Income Register</CardTitle>
          <CardDescription>Track projected vs actual receipts</CardDescription>
        </CardHeader>
        <CardContent>
          {incomes?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No revenue sources recorded.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Target Month</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-center">Confidence</TableHead>
                    <TableHead className="text-right">Projected</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomes?.map((income) => {
                    const variance = income.actualAmount !== null && income.actualAmount !== undefined 
                      ? income.actualAmount - income.projectedAmount 
                      : null;
                      
                    return (
                      <TableRow key={income.id}>
                        <TableCell>
                          <span className="flex items-center gap-2 text-sm font-mono bg-muted px-2 py-1 rounded-md w-max">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {income.month}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{income.source}</TableCell>
                        <TableCell className="text-center">
                          {getConfidenceBadge(income.confidence)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(income.projectedAmount)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-foreground">
                          {income.actualAmount !== null && income.actualAmount !== undefined ? formatCurrency(income.actualAmount) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {variance !== null ? (
                            <span className={variance >= 0 ? "text-emerald-500" : "text-destructive"}>
                              {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(income)} className="h-8 w-8 hover:text-primary">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(income.id)} className="h-8 w-8 hover:text-destructive">
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