import { useState } from "react";
import {
  ExpenseCategory,
  TransactionClassificationInputCategory,
  TransactionClassificationInputEmotionalTrigger,
  useClassifyTransaction,
  useListExpenses,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, HeartHandshake, Sparkles, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_NAMES: Record<string, string> = {
  housing: "Жильё", food: "Питание", transport: "Транспорт",
  utilities: "Коммунальные / связь", health: "Здоровье", miscellaneous: "Разное",
};

const TRIGGER_NAMES: Record<string, string> = {
  routine: "Рутина / план",
  stress_buying: "Снятие стресса",
  status_validation: "Статус и признание",
  burnout_convenience: "Удобство при выгорании",
};

export default function Behavioral() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: expenses } = useListExpenses({ query: { queryKey: ["/api/expenses"] } });
  const classify = useClassifyTransaction();
  const [form, setForm] = useState({
    name: "", amount: "", category: "miscellaneous", isEssential: false,
    emotionalTrigger: "auto", isImpulseBuy: false,
  });

  const tracked = (expenses ?? []).filter((item) => item.emotionalTrigger || item.isImpulseBuy);
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.name.trim() || !Number.isFinite(amount) || amount < 0) {
      toast({ title: "Заполните название и корректную сумму", variant: "destructive" });
      return;
    }
    classify.mutate({
      data: {
        name: form.name.trim(),
        amount,
        category: form.category as TransactionClassificationInputCategory,
        isEssential: form.isEssential,
        isImpulseBuy: form.isImpulseBuy,
        ...(form.emotionalTrigger !== "auto" ? {
          emotionalTrigger: form.emotionalTrigger as TransactionClassificationInputEmotionalTrigger,
        } : {}),
      },
    }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/expenses/burn-rate"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        setForm({ name: "", amount: "", category: "miscellaneous", isEssential: false, emotionalTrigger: "auto", isImpulseBuy: false });
        toast({ title: "Трата отмечена бережно", description: result.guidance });
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400"><BrainCircuit className="h-6 w-6" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Осознанные траты</h1>
            <p className="text-muted-foreground mt-1">Наблюдаем за привычками без стыда и запретов.</p>
          </div>
        </div>
      </div>

      <Card className="border-violet-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HeartHandshake className="h-5 w-5 text-violet-400" /> No-Shame Protocol</CardTitle>
          <CardDescription>Отметьте контекст покупки. Система предложит нейтральную, поддерживающую формулировку.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Что купили?</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Например: доставка ужина" />
            </div>
            <div className="space-y-2">
              <Label>Сумма, сом</Label>
              <Input type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(ExpenseCategory).map((category) => (
                    <SelectItem key={category} value={category}>{CATEGORY_NAMES[category]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Что было главным фактором?</Label>
              <Select value={form.emotionalTrigger} onValueChange={(emotionalTrigger) => setForm({ ...form, emotionalTrigger })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Определить бережно</SelectItem>
                  {Object.entries(TRIGGER_NAMES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium text-sm">Импульсная покупка?</p>
                <p className="text-xs text-muted-foreground">Не оценка, а полезная пометка.</p>
              </div>
              <Switch checked={form.isImpulseBuy} onCheckedChange={(isImpulseBuy) => setForm({ ...form, isImpulseBuy })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium text-sm">Обязательная трата?</p>
                <p className="text-xs text-muted-foreground">Влияет на антикризисный расчёт.</p>
              </div>
              <Switch checked={form.isEssential} onCheckedChange={(isEssential) => setForm({ ...form, isEssential })} />
            </div>
            <Button type="submit" className="md:col-span-2" disabled={classify.isPending}>
              <Sparkles className="mr-2 h-4 w-4" /> {classify.isPending ? "Анализируем контекст…" : "Отметить и понять контекст"}
            </Button>
          </form>
          {classify.data && (
            <div className="mt-5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
              <p className="text-xs uppercase font-bold tracking-wider text-violet-400 mb-1">{TRIGGER_NAMES[classify.data.emotionalTrigger]}</p>
              <p className="font-medium">{classify.data.guidance}</p>
              <p className="text-sm text-muted-foreground mt-2">{classify.data.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-amber-500" /> Карта поведенческих трат</CardTitle>
          <CardDescription>Здесь остаются только траты, для которых вы зафиксировали контекст.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tracked.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Пока нет отмеченных трат. Добавьте первую — без давления и оценок.</p>
          ) : tracked.map((expense) => (
            <div key={expense.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-4">
              <div>
                <p className="font-semibold">{expense.name}</p>
                <p className="text-sm text-muted-foreground">{CATEGORY_NAMES[expense.category]} · {expense.amount.toLocaleString("ru-RU")} сом</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {expense.emotionalTrigger && <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-400">{TRIGGER_NAMES[expense.emotionalTrigger]}</span>}
                {expense.isImpulseBuy && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500">Импульс</span>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}