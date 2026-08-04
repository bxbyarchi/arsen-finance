import { useState } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  useGetProjectsSummary,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  Project,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TrendingUp, ArrowRight, BarChart3, Wallet, PiggyBank } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from "recharts";

const fmt = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + "\u00a0сом";

const PRESET_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"];

const projectSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  description: z.string().optional(),
  color: z.string().default("#6366f1"),
});

export default function Projects() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: projects, isLoading: loadingProjects } = useListProjects({ query: { queryKey: ["/api/projects"] } });
  const { data: summary, isLoading: loadingSummary } = useGetProjectsSummary({ query: { queryKey: ["/api/projects/summary"] } });
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", description: "", color: "#6366f1" },
  });

  const openCreate = () => {
    setEditingProject(null);
    form.reset({ name: "", description: "", color: PRESET_COLORS[projects?.length ?? 0 % PRESET_COLORS.length] });
    setDialogOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    form.reset({ name: p.name, description: p.description ?? "", color: p.color });
    setDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof projectSchema>) => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDialogOpen(false);
    };
    if (editingProject) {
      updateProject.mutate({ id: editingProject.id, data }, { onSuccess: () => { toast({ title: "Проект обновлён" }); invalidate(); } });
    } else {
      createProject.mutate({ data }, { onSuccess: () => { toast({ title: "Проект создан" }); invalidate(); } });
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Удалить проект «${name}»? Это удалит все его записи.`)) return;
    deleteProject.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ title: "Проект удалён" });
      },
    });
  };

  if (loadingProjects || loadingSummary) {
    return <div className="space-y-6"><Skeleton className="h-12 w-72" /><div className="grid grid-cols-3 gap-6">{[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}</div></div>;
  }

  const chartData = summary?.projects.map(p => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name,
    "Оборот": Math.round(p.totalRevenue),
    "Чистая прибыль": Math.round(p.totalNetProfit),
    "Дивиденды": Math.round(p.totalDividends),
    color: p.color,
  })) ?? [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Мои проекты</h1>
          <p className="text-muted-foreground mt-1">P&L по каждому бизнесу — оборот, прибыль, дивиденды.</p>
        </div>
        <Button size="lg" onClick={openCreate} className="font-semibold hover-elevate">
          <Plus className="mr-2 h-4 w-4" /> Новый проект
        </Button>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Редактировать проект" : "Новый проект"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Название проекта</FormLabel>
                  <FormControl><Input {...field} placeholder="напр. TikTok монетизация, Уборочная компания" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание (необязательно)</FormLabel>
                  <FormControl><Textarea {...field} rows={2} placeholder="Краткое описание бизнеса" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Цвет проекта</FormLabel>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => form.setValue("color", c)}
                        className={`w-8 h-8 rounded-full border-4 transition-transform hover:scale-110 ${field.value === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end pt-2">
                <Button type="submit" size="lg" disabled={createProject.isPending || updateProject.isPending}>
                  {editingProject ? "Сохранить" : "Создать"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Totals */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Общий оборот", value: summary.totals.grossRevenue, icon: BarChart3, color: "text-primary" },
            { label: "Чистая прибыль", value: summary.totals.netProfit, icon: TrendingUp, color: summary.totals.netProfit >= 0 ? "text-emerald-500" : "text-destructive" },
            { label: "Дивиденды", value: summary.totals.dividends, icon: PiggyBank, color: "text-amber-500" },
            { label: "Реинвестиции", value: summary.totals.reinvestment, icon: Wallet, color: "text-violet-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${color}`}>{fmt(value)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Chart + project cards */}
      {projects && projects.length > 0 ? (
        <>
          {/* Bar chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Сравнение проектов</CardTitle>
                <CardDescription>Оборот, чистая прибыль и дивиденды по каждому проекту</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(v)}`} width={60} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number, name: string) => [fmt(v), name]}
                    />
                    <Legend />
                    <Bar dataKey="Оборот" fill="hsl(var(--primary))" radius={[3,3,0,0]} maxBarSize={36} />
                    <Bar dataKey="Чистая прибыль" fill="hsl(var(--chart-2))" radius={[3,3,0,0]} maxBarSize={36} />
                    <Bar dataKey="Дивиденды" fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Project cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map((project) => {
              const pnl = summary?.projects.find(p => p.id === project.id);
              return (
                <Card key={project.id} className="hover-elevate border-l-4 overflow-hidden" style={{ borderLeftColor: project.color }}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                        {project.description && <CardDescription className="mt-0.5 line-clamp-1">{project.description}</CardDescription>}
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(project); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(project.id, project.name); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className="text-xs text-muted-foreground">Оборот</div>
                        <div className="font-bold">{fmt(pnl?.totalRevenue ?? 0)}</div>
                      </div>
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className="text-xs text-muted-foreground">Прибыль</div>
                        <div className={`font-bold ${(pnl?.totalNetProfit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(pnl?.totalNetProfit ?? 0)}</div>
                      </div>
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className="text-xs text-muted-foreground">Дивиденды</div>
                        <div className="font-bold text-amber-500">{fmt(pnl?.totalDividends ?? 0)}</div>
                      </div>
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className="text-xs text-muted-foreground">Записей</div>
                        <div className="font-bold">{pnl?.entryCount ?? 0}</div>
                      </div>
                    </div>
                    <Link href={`/projects/${project.id}`}>
                      <Button variant="outline" className="w-full mt-1" size="sm">
                        Открыть P&L <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card className="border-dashed border-2 py-16 text-center">
          <BarChart3 className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-20" />
          <h3 className="text-xl font-bold mb-2">Проектов пока нет</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Создайте проект для отслеживания P&L каждого бизнеса или источника дохода.
          </p>
          <Button size="lg" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Первый проект</Button>
        </Card>
      )}
    </div>
  );
}
