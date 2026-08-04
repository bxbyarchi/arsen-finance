import { useState, useEffect } from "react";
import {
  useCreateDavlatovAllocation,
  useListDavlatovAllocations,
  useDeleteDavlatovAllocation,
  DavlatovAllocation,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Sparkles, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + "\u00a0сом";

const fmtPct = (v: number) => v.toFixed(1) + "%";

interface AllocationPreview {
  charityAmt: number;
  parentsAmt: number;
  savingsAmt: number;
  entertainmentAmt: number;
  largeDreamAmt: number;
  smallDreamAmt: number;
  remaining: number;
}

function calcAllocation(amount: number, charityPct: number): AllocationPreview {
  const charityAmt = amount * (charityPct / 100);
  const parentsAmt = amount * 0.10;
  const savingsAmt = amount * 0.10;
  const entertainmentAmt = amount * 0.10;
  const remaining = Math.max(0, amount - charityAmt - parentsAmt - savingsAmt - entertainmentAmt);
  const largeDreamAmt = remaining * 0.50;
  const smallDreamAmt = remaining * 0.50;
  return { charityAmt, parentsAmt, savingsAmt, entertainmentAmt, largeDreamAmt, smallDreamAmt, remaining };
}

const BUCKETS = [
  { key: "charityAmt", label: "Благотворительность", emoji: "🤲", desc: "Садака / Зякят", color: "bg-rose-500/10 border-rose-500/30 text-rose-500" },
  { key: "parentsAmt", label: "Родителям", emoji: "👪", desc: "10% — всегда", color: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  { key: "savingsAmt", label: "На будущее", emoji: "💰", desc: "Накопления / Подушка", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" },
  { key: "entertainmentAmt", label: "Развлечения", emoji: "🎉", desc: "Отдых и удовольствие", color: "bg-sky-500/10 border-sky-500/30 text-sky-500" },
  { key: "largeDreamAmt", label: "Большие мечты", emoji: "🏠", desc: "50% остатка — крупные цели", color: "bg-violet-500/10 border-violet-500/30 text-violet-500" },
  { key: "smallDreamAmt", label: "Малые мечты", emoji: "✨", desc: "50% остатка — небольшие желания", color: "bg-pink-500/10 border-pink-500/30 text-pink-500" },
];

export default function Davlatov() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [amount, setAmount] = useState<string>("");
  const [sourceType, setSourceType] = useState<"dividend" | "personal_income">("personal_income");
  const [charityPct, setCharityPct] = useState<number>(10);
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [notes, setNotes] = useState("");

  const { data: history, isLoading } = useListDavlatovAllocations({ query: { queryKey: ["/api/davlatov/allocations"] } });
  const createAllocation = useCreateDavlatovAllocation();
  const deleteAllocation = useDeleteDavlatovAllocation();

  useEffect(() => {
    const n = parseFloat(amount);
    if (n > 0) {
      setPreview(calcAllocation(n, charityPct));
    } else {
      setPreview(null);
    }
  }, [amount, charityPct]);

  const handleSave = () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    createAllocation.mutate({ data: { sourceAmount: n, sourceType, charityPct, notes: notes || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/davlatov/allocations"] });
        toast({ title: "Распределение сохранено ✓" });
        setAmount("");
        setNotes("");
        setPreview(null);
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteAllocation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/davlatov/allocations"] });
        toast({ title: "Запись удалена" });
      },
    });
  };

  const amountNum = parseFloat(amount) || 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Метод Давлатова</h1>
        <p className="text-muted-foreground mt-1">
          Автоматическое распределение любого дохода или дивидендов по 6 фондам — по методике Саидмурода Давлатова.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input panel */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Калькулятор
              </CardTitle>
              <CardDescription>Введите сумму — и получите готовую раскладку по фондам.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Сумма (сом)</label>
                <Input
                  type="number"
                  step="100"
                  placeholder="напр. 100 000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-lg h-12 font-mono"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Источник</label>
                <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal_income">💼 Личный доход / Зарплата</SelectItem>
                    <SelectItem value="dividend">📈 Дивиденды с бизнеса</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">Благотворительность</label>
                  <Badge variant="outline" className="font-mono text-rose-500 border-rose-500/40">{fmtPct(charityPct)}</Badge>
                </div>
                <Slider
                  min={2.5} max={10} step={0.5}
                  value={[charityPct]}
                  onValueChange={([v]) => setCharityPct(v)}
                  className="[&>span]:bg-rose-500"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>2.5% (минимум)</span><span>10% (максимум)</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Заметки (необязательно)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="напр. Зарплата август 2026" />
              </div>

              <div className="bg-muted/30 rounded-md p-3 text-sm space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-xs mb-2">Формула Давлатова</p>
                <p>🤲 Садака: <strong>{fmtPct(charityPct)}</strong></p>
                <p>👪 Родителям: <strong>10%</strong></p>
                <p>💰 Накопления: <strong>10%</strong></p>
                <p>🎉 Развлечения: <strong>10%</strong></p>
                <p>🏠 + ✨ Оставшееся: <strong>50/50 (мечты)</strong></p>
              </div>

              <Button size="lg" className="w-full font-semibold" onClick={handleSave}
                disabled={!amountNum || amountNum <= 0 || createAllocation.isPending}>
                {createAllocation.isPending
                  ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Сохраняем…</>
                  : "Сохранить распределение"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">
            {preview ? `Раскладка для ${fmt(amountNum)}` : "Введите сумму для расчёта"}
          </h2>

          {BUCKETS.map(({ key, label, emoji, desc, color }) => {
            const value = preview ? (preview as any)[key] : 0;
            const pct = amountNum > 0 ? (value / amountNum) * 100 : 0;
            return (
              <div key={key} className={`border rounded-xl p-4 ${color} transition-all duration-300`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <div>
                      <div className="font-bold text-sm">{label}</div>
                      <div className="text-xs opacity-70">{desc}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black">{preview ? fmt(value) : "—"}</div>
                    <div className="text-xs opacity-70">{preview ? fmtPct(pct) : "—"}</div>
                  </div>
                </div>
                {preview && (
                  <div className="mt-2 h-1.5 rounded-full bg-current/10 overflow-hidden">
                    <div className="h-full bg-current rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>История распределений</CardTitle>
          <CardDescription>Все сохранённые расчёты по методу Давлатова</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : (history ?? []).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>Нет сохранённых распределений. Введите сумму и нажмите «Сохранить».</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="text-right">Садака</TableHead>
                    <TableHead className="text-right">Родители</TableHead>
                    <TableHead className="text-right">Накопления</TableHead>
                    <TableHead className="text-right">Развлечения</TableHead>
                    <TableHead className="text-right">Большие мечты</TableHead>
                    <TableHead className="text-right">Малые мечты</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history ?? []).map((a: DavlatovAllocation) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(a.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell>
                        {a.sourceType === "dividend"
                          ? <Badge variant="outline" className="text-amber-500 border-amber-500/30">Дивиденды</Badge>
                          : <Badge variant="outline" className="text-primary border-primary/30">Доход</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">{fmt(a.sourceAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-rose-500">{fmt(a.charityAmt)}</TableCell>
                      <TableCell className="text-right font-mono text-amber-500">{fmt(a.parentsAmt)}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-500">{fmt(a.savingsAmt)}</TableCell>
                      <TableCell className="text-right font-mono text-sky-500">{fmt(a.entertainmentAmt)}</TableCell>
                      <TableCell className="text-right font-mono text-violet-500">{fmt(a.largeDreamAmt)}</TableCell>
                      <TableCell className="text-right font-mono text-pink-500">{fmt(a.smallDreamAmt)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
