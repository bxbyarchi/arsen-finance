import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetProject,
  useListProjectEntries,
  useCreateProjectEntry,
  useUpdateProjectEntry,
  useDeleteProjectEntry,
  ProjectEntry,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + "\u00a0сом";

const entrySchema = z.object({
  month: z.string().min(7, "Обязательное поле"),
  grossRevenue: z.coerce.number().min(0).default(0),
  directCosts: z.coerce.number().min(0).default(0),
  marketingExpense: z.coerce.number().min(0).default(0),
  salaryExpense: z.coerce.number().min(0).default(0),
  rentExpense: z.coerce.number().min(0).default(0),
  logisticsExpense: z.coerce.number().min(0).default(0),
  utilitiesExpense: z.coerce.number().min(0).default(0),
  reinvestment: z.coerce.number().min(0).default(0),
  dividends: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

type EntryForm = z.infer<typeof entrySchema>;

const BLANK: EntryForm = {
  month: new Date().toISOString().slice(0, 7),
  grossRevenue: 0, directCosts: 0, marketingExpense: 0, salaryExpense: 0,
  rentExpense: 0, logisticsExpense: 0, utilitiesExpense: 0, reinvestment: 0, dividends: 0, notes: "",
};

function fromEntry(e: any): EntryForm {
  return {
    month: e.month, grossRevenue: e.grossRevenue, directCosts: e.directCosts,
    marketingExpense: e.marketingExpense, salaryExpense: e.salaryExpense,
    rentExpense: e.rentExpense, logisticsExpense: e.logisticsExpense,
    utilitiesExpense: e.utilitiesExpense, reinvestment: e.reinvestment,
    dividends: e.dividends, notes: e.notes ?? "",
  };
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: project, isLoading: loadingProject } = useGetProject(projectId, { query: { queryKey: [`/api/projects/${projectId}`] } });
  const { data: entries, isLoading: loadingEntries } = useListProjectEntries(projectId, { query: { queryKey: [`/api/projects/${projectId}/entries`] } });
  const createEntry = useCreateProjectEntry();
  const updateEntry = useUpdateProjectEntry();
  const deleteEntry = useDeleteProjectEntry();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ProjectEntry | null>(null);

  const form = useForm<EntryForm>({ resolver: zodResolver(entrySchema), defaultValues: BLANK });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/entries`] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    setDialogOpen(false);
  };

  const onSubmit = (data: EntryForm) => {
    if (editingEntry) {
      updateEntry.mutate({ id: projectId, entryId: editingEntry.id, data }, {
        onSuccess: () => { toast({ title: "Запись обновлена" }); invalidate(); },
      });
    } else {
      createEntry.mutate({ id: projectId, data }, {
        onSuccess: () => { toast({ title: "Запись добавлена" }); invalidate(); },
      });
    }
  };

  const handleDelete = (entryId: number) => {
    if (!confirm("Удалить эту запись?")) return;
    deleteEntry.mutate({ id: projectId, entryId }, {
      onSuccess: () => { toast({ title: "Запись удалена" }); invalidate(); },
    });
  };

  if (loadingProject || !project) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  // Aggregate totals
  const totals = (entries ?? []).reduce((acc, e: any) => ({
    grossRevenue: acc.grossRevenue + e.grossRevenue,
    directCosts: acc.directCosts + e.directCosts,
    grossProfit: acc.grossProfit + (e.grossProfit ?? e.grossRevenue - e.directCosts),
    totalOpex: acc.totalOpex + (e.totalOpex ?? e.marketingExpense + e.salaryExpense + e.rentExpense + e.logisticsExpense + e.utilitiesExpense),
    netProfit: acc.netProfit + (e.netProfit ?? 0),
    reinvestment: acc.reinvestment + e.reinvestment,
    dividends: acc.dividends + e.dividends,
  }), { grossRevenue: 0, directCosts: 0, grossProfit: 0, totalOpex: 0, netProfit: 0, reinvestment: 0, dividends: 0 });

  const kpis = [
    { label: "Оборот (Gross Revenue)", value: totals.grossRevenue, color: "text-primary" },
    { label: "Закуп / Прямые расходы", value: totals.directCosts, color: "text-destructive" },
    { label: "Маржа (Gross Profit)", value: totals.grossProfit, color: totals.grossProfit >= 0 ? "text-emerald-500" : "text-destructive" },
    { label: "Операционные расходы", value: totals.totalOpex, color: "text-destructive" },
    { label: "Чистая прибыль", value: totals.netProfit, color: totals.netProfit >= 0 ? "text-emerald-500" : "text-destructive" },
    { label: "Реинвестиции", value: totals.reinvestment, color: "text-violet-500" },
    { label: "Дивиденды", value: totals.dividends, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="mt-1 shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
            <h1 className="text-3xl font-bold tracking-tight truncate">{project.name}</h1>
          </div>
          {project.description && <p className="text-muted-foreground">{project.description}</p>}
        </div>
        <Button size="lg" onClick={() => { setEditingEntry(null); form.reset(BLANK); setDialogOpen(true); }} className="font-semibold shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Новая запись
        </Button>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Редактировать запись" : "Добавить месячную запись P&L"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-2">
              <FormField control={form.control} name="month" render={({ field }) => (
                <FormItem>
                  <FormLabel>Месяц</FormLabel>
                  <FormControl><Input type="month" {...field} className="w-48" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Выручка и закуп</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["grossRevenue", "Оборот / Выручка (сом)"],
                    ["directCosts", "Закуп / Прямые расходы (сом)"],
                  ].map(([name, label]) => (
                    <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl><Input type="number" step="1" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Операционные расходы</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["marketingExpense", "Маркетинг (сом)"],
                    ["salaryExpense", "Зарплата (сом)"],
                    ["rentExpense", "Аренда (сом)"],
                    ["logisticsExpense", "Логистика (сом)"],
                    ["utilitiesExpense", "Коммуналка (сом)"],
                  ].map(([name, label]) => (
                    <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl><Input type="number" step="1" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Распределение прибыли</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["reinvestment", "Реинвестиции (сом)"],
                    ["dividends", "Дивиденды на личный счёт (сом)"],
                  ].map(([name, label]) => (
                    <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl><Input type="number" step="1" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Комментарий</FormLabel>
                  <FormControl><Textarea {...field} rows={2} placeholder="Необязательные заметки" /></FormControl>
                </FormItem>
              )} />
              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={createEntry.isPending || updateEntry.isPending}>
                  {editingEntry ? "Сохранить" : "Добавить"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* KPI totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map(({ label, value, color }) => (
          <Card key={label} className="hover-elevate">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground leading-tight mb-2">{label}</div>
              <div className={`text-lg font-bold ${color}`}>{fmt(value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entries table */}
      <Card>
        <CardHeader>
          <CardTitle>Записи по месяцам</CardTitle>
          <CardDescription>Каждая строка — один месяц работы проекта</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEntries ? <Skeleton className="h-40 w-full" /> : entries?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Записей нет. Добавьте первую месячную запись P&L.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Месяц</TableHead>
                    <TableHead className="text-right">Оборот</TableHead>
                    <TableHead className="text-right">Закуп</TableHead>
                    <TableHead className="text-right">Маржа</TableHead>
                    <TableHead className="text-right">Опер. расходы</TableHead>
                    <TableHead className="text-right">Чистая прибыль</TableHead>
                    <TableHead className="text-right">Реинвест.</TableHead>
                    <TableHead className="text-right">Дивиденды</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries?.map((entry: any) => {
                    const grossProfit = entry.grossProfit ?? entry.grossRevenue - entry.directCosts;
                    const totalOpex = entry.totalOpex ?? entry.marketingExpense + entry.salaryExpense + entry.rentExpense + entry.logisticsExpense + entry.utilitiesExpense;
                    const netProfit = entry.netProfit ?? grossProfit - totalOpex;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono font-medium">{entry.month}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(entry.grossRevenue)}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">{fmt(entry.directCosts)}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${grossProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(grossProfit)}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">{fmt(totalOpex)}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          <span className="flex items-center justify-end gap-1">
                            {netProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {fmt(netProfit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-violet-500">{fmt(entry.reinvestment)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-500">{fmt(entry.dividends)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingEntry(entry); form.reset(fromEntry(entry)); setDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(entry.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
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
