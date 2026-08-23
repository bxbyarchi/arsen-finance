import { useState } from "react";
import {
  BusinessHypothesisInputStatus,
  useCreateBusinessHypothesis,
  useDeleteBusinessHypothesis,
  useEvaluateBusinessHypothesis,
  useListBusinessHypotheses,
  useReflectOnBusinessHypothesis,
  useUpdateBusinessHypothesis,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Beaker, CircleDollarSign, Lightbulb, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const ZONE_LABELS: Record<string, string> = {
  learning_zone: "Learning Zone",
  performance_zone: "Performance Zone",
  archived: "Архив / уроки",
};
const ZONE_STYLE: Record<string, string> = {
  learning_zone: "border-violet-500/30 bg-violet-500/5",
  performance_zone: "border-emerald-500/30 bg-emerald-500/5",
  archived: "border-muted bg-muted/20",
};
const RISK_STYLE: Record<string, string> = {
  Low: "text-emerald-600",
  Medium: "text-amber-600",
  High: "text-orange-600",
  "Barbell Violation": "text-destructive",
};

export default function Hypotheses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: hypotheses } = useListBusinessHypotheses({ query: { queryKey: ["/api/hypotheses"] } });
  const createHypothesis = useCreateBusinessHypothesis();
  const updateHypothesis = useUpdateBusinessHypothesis();
  const reflect = useReflectOnBusinessHypothesis();
  const deleteHypothesis = useDeleteBusinessHypothesis();
  const evaluate = useEvaluateBusinessHypothesis();
  const [form, setForm] = useState({
    title: "", status: "learning_zone", projectedBudget: "", actualRiskImpact: "",
    expectedMonthlyRevenue: "", expectedMonthlyCosts: "",
  });
  const [reflectionId, setReflectionId] = useState<number | null>(null);
  const [reflection, setReflection] = useState({ worked: "", failed: "", adjust: "", keyLessons: "" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/hypotheses"] });

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Опишите гипотезу", variant: "destructive" });
      return;
    }
    createHypothesis.mutate({
      data: {
        title: form.title.trim(),
        status: form.status as BusinessHypothesisInputStatus,
        projectedBudget: Number(form.projectedBudget || 0),
        actualRiskImpact: Number(form.actualRiskImpact || 0),
        expectedMonthlyRevenue: Number(form.expectedMonthlyRevenue || 0),
        expectedMonthlyCosts: Number(form.expectedMonthlyCosts || 0),
      },
    }, {
      onSuccess: () => {
        setForm({
          title: "", status: "learning_zone", projectedBudget: "", actualRiskImpact: "",
          expectedMonthlyRevenue: "", expectedMonthlyCosts: "",
        });
        refresh();
        toast({ title: "Гипотеза проверена", description: "Стресс-тест сохранён вместе с новой гипотезой." });
      },
    });
  };
  const evaluateExisting = (hypothesisId: number) => {
    evaluate.mutate({ data: { hypothesisId } }, {
      onSuccess: (result) => {
        refresh();
        toast({
          title: `Риск: ${result.evaluation.riskRating}`,
          description: result.evaluation.conservativePaybackMonths === null
            ? "При стресс-сценарии идея не окупается."
            : `Консервативная окупаемость: ${result.evaluation.conservativePaybackMonths.toLocaleString("ru-RU")} мес.`,
        });
      },
      onError: () => toast({ title: "Не удалось проверить гипотезу", description: "Проверьте финансовые допущения и попробуйте снова.", variant: "destructive" }),
    });
  };
  const submitReflection = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reflectionId) return;
    reflect.mutate({ id: reflectionId, data: reflection }, {
      onSuccess: () => {
        setReflectionId(null);
        setReflection({ worked: "", failed: "", adjust: "", keyLessons: "" });
        refresh();
        toast({ title: "Beyoncé Loop сохранён", description: "Гипотеза переведена в архив с уроками." });
      },
    });
  };

  const zones = ["learning_zone", "performance_zone", "archived"];
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Beaker className="h-6 w-6" /></div>
        <div><h1 className="text-3xl font-bold tracking-tight">Песочница гипотез</h1><p className="text-muted-foreground mt-1">Отделяйте эксперименты для обучения от проверенных рабочих процессов.</p></div>
      </div>

      <Card>
        <CardHeader><CardTitle>Новая бизнес-гипотеза</CardTitle><CardDescription>В Learning Zone допустим контролируемый риск. В Performance Zone — уже проверенные действия.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 space-y-2"><Label>Гипотеза</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Например: короткие видео приведут 10 заявок" /></div>
            <div className="space-y-2"><Label>Зона</Label><Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="learning_zone">Learning Zone</SelectItem><SelectItem value="performance_zone">Performance Zone</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Бюджет, сом</Label><Input type="number" min="0" value={form.projectedBudget} onChange={(event) => setForm({ ...form, projectedBudget: event.target.value })} placeholder="0" /></div>
            <div className="space-y-2"><Label>Доход/мес, сом</Label><Input type="number" min="0" value={form.expectedMonthlyRevenue} onChange={(event) => setForm({ ...form, expectedMonthlyRevenue: event.target.value })} placeholder="Ожидаемый доход" /></div>
            <div className="space-y-2"><Label>Расходы/мес, сом</Label><Input type="number" min="0" value={form.expectedMonthlyCosts} onChange={(event) => setForm({ ...form, expectedMonthlyCosts: event.target.value })} placeholder="Ожидаемые расходы" /></div>
            <div className="md:col-span-3 space-y-2"><Label>Влияние риска, сом</Label><Input type="number" min="0" value={form.actualRiskImpact} onChange={(event) => setForm({ ...form, actualRiskImpact: event.target.value })} placeholder="Максимально приемлемая цена обучения" /></div>
            <Button type="submit" disabled={createHypothesis.isPending}><Lightbulb className="h-4 w-4 mr-2" /> Добавить и стресс-тестировать</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {zones.map((zone) => (
          <Card key={zone} className={ZONE_STYLE[zone]}>
            <CardHeader className="pb-3"><CardTitle className="text-base">{ZONE_LABELS[zone]}</CardTitle><CardDescription>{zone === "learning_zone" ? "Эксперименты, которые покупают знания." : zone === "performance_zone" ? "Проверенные действия для результата." : "Завершённые циклы и накопленные уроки."}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(hypotheses ?? []).filter((item) => item.status === zone).length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Пока пусто</p> : (hypotheses ?? []).filter((item) => item.status === zone).map((hypothesis) => (
                <div key={hypothesis.id} className="rounded-lg border bg-card/70 p-4 space-y-3">
                  <div className="flex justify-between gap-3"><p className="font-semibold">{hypothesis.title}</p><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteHypothesis.mutate({ id: hypothesis.id }, { onSuccess: refresh })}><Trash2 className="h-4 w-4" /></Button></div>
                   <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded bg-muted p-2"><p className="text-muted-foreground">Бюджет</p><p className="font-mono font-semibold">{hypothesis.projectedBudget.toLocaleString("ru-RU")} сом</p></div><div className="rounded bg-muted p-2"><p className="text-muted-foreground">Риск</p><p className="font-mono font-semibold">{hypothesis.actualRiskImpact.toLocaleString("ru-RU")} сом</p></div></div>
                   {hypothesis.riskRating && <div className="rounded border bg-background/60 p-2 text-xs space-y-1"><div className="flex justify-between gap-2"><span className="text-muted-foreground">Graham + Barbell</span><span className={`font-semibold ${RISK_STYLE[hypothesis.riskRating] ?? ""}`}>{hypothesis.riskRating}</span></div><p className="text-muted-foreground">Стресс: доход −30%, расходы +20%</p><p>Окупаемость: <span className="font-mono font-semibold">{hypothesis.conservativePaybackMonths == null ? "не окупается" : `${hypothesis.conservativePaybackMonths.toLocaleString("ru-RU")} мес.`}</span> · запас: <span className="font-mono font-semibold">{hypothesis.marginOfSafety?.toLocaleString("ru-RU") ?? "0"}%</span></p></div>}
                  {hypothesis.keyLessons && <p className="whitespace-pre-line text-xs text-muted-foreground">{hypothesis.keyLessons}</p>}
                   {zone !== "archived" && <div className="flex gap-2 flex-wrap"><Button size="sm" variant="outline" disabled={evaluate.isPending} onClick={() => evaluateExisting(hypothesis.id)}><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Стресс-тест</Button><Button size="sm" variant="outline" onClick={() => updateHypothesis.mutate({ id: hypothesis.id, data: { status: zone === "learning_zone" ? "performance_zone" : "learning_zone" } }, { onSuccess: refresh })}>{zone === "learning_zone" ? "В Performance" : "Вернуть в Learning"}</Button><Button size="sm" onClick={() => setReflectionId(hypothesis.id)}><Archive className="h-3.5 w-3.5 mr-1" /> Beyoncé Loop</Button></div>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={reflectionId !== null} onOpenChange={(open) => !open && setReflectionId(null)}>
        <DialogContent className="sm:max-w-[580px]"><DialogHeader><DialogTitle>Beyoncé Loop: собрать уроки</DialogTitle></DialogHeader>
          <form onSubmit={submitReflection} className="space-y-4">
            <div className="space-y-2"><Label>Что сработало?</Label><Textarea value={reflection.worked} onChange={(event) => setReflection({ ...reflection, worked: event.target.value })} /></div>
            <div className="space-y-2"><Label>Что не сработало?</Label><Textarea value={reflection.failed} onChange={(event) => setReflection({ ...reflection, failed: event.target.value })} /></div>
            <div className="space-y-2"><Label>Что изменить в следующем цикле?</Label><Textarea value={reflection.adjust} onChange={(event) => setReflection({ ...reflection, adjust: event.target.value })} /></div>
            <div className="space-y-2"><Label>Главный урок</Label><Textarea value={reflection.keyLessons} onChange={(event) => setReflection({ ...reflection, keyLessons: event.target.value })} /></div>
            <Button type="submit" disabled={reflect.isPending}><CircleDollarSign className="h-4 w-4 mr-2" /> Завершить и сохранить урок</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}