import { useState } from "react";
import {
  FinancialAutonomyProfileMoneyScriptType,
  VaultDocumentInputDocCategory,
  useCreateVaultDocument,
  useDeleteVaultDocument,
  useGetFinancialAutonomyProfile,
  useGetVaultSummary,
  useUpdateFinancialAutonomyProfile,
  useVerifyVaultDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileKey2, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const SCRIPT_LABELS: Record<string, string> = {
  avoidance: "Избегание — хочется не смотреть на цифры",
  worship: "Поклонение — деньги кажутся мерой ценности",
  status: "Статус — деньги подтверждают образ",
  vigilance: "Бдительность — деньги дают чувство безопасности",
};
const CATEGORY_LABELS: Record<string, string> = {
  bank_account: "Банковский доступ",
  tax_file: "Налоговые документы",
  contract: "Контракты и обязательства",
  emergency_plan: "Экстренный план",
};

export default function Autonomy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetFinancialAutonomyProfile({ query: { queryKey: ["/api/financial-profile"] } });
  const { data: vault } = useGetVaultSummary({ query: { queryKey: ["/api/vault"] } });
  const updateProfile = useUpdateFinancialAutonomyProfile();
  const createDocument = useCreateVaultDocument();
  const verifyDocument = useVerifyVaultDocument();
  const deleteDocument = useDeleteVaultDocument();
  const [document, setDocument] = useState({ docCategory: "bank_account", title: "", encryptedPayload: "" });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vault"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financial-profile"] });
  };
  const changeProfile = (data: { moneyScriptType?: FinancialAutonomyProfileMoneyScriptType; riskToleranceIndex?: number }) => {
    updateProfile.mutate({ data }, { onSuccess: refresh });
  };
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!document.title.trim() || !document.encryptedPayload.trim()) {
      toast({ title: "Укажите название и безопасную зашифрованную ссылку", description: "Не вводите пароли, коды или номера карт.", variant: "destructive" });
      return;
    }
    createDocument.mutate({
      data: {
        docCategory: document.docCategory as VaultDocumentInputDocCategory,
        title: document.title.trim(),
        encryptedPayload: document.encryptedPayload.trim(),
        lastVerifiedAt: new Date().toISOString(),
      },
    }, {
      onSuccess: () => {
        setDocument({ docCategory: "bank_account", title: "", encryptedPayload: "" });
        refresh();
        toast({ title: "Запись добавлена", description: "Содержимое не выводится в интерфейсе." });
      },
    });
  };

  const score = vault?.autonomyScore ?? profile?.autonomyScore ?? 0;
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500"><ShieldCheck className="h-6 w-6" /></div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Финансовая автономия</h1>
          <p className="text-muted-foreground mt-1">Личная устойчивость, риск-профиль и цифровой сейф без раскрытия содержимого.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-emerald-500/20">
          <CardHeader>
            <CardTitle>Индекс автономии</CardTitle>
            <CardDescription>Готовность критических документов: 4 категории × 25 баллов.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold text-emerald-500">{score}<span className="text-lg text-muted-foreground">/100</span></div>
            <Progress value={score} className="mt-4 h-3" />
            <p className="text-sm text-muted-foreground mt-4">Проверяйте важные записи раз в 60 дней, чтобы сохранять устойчивость.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Ваш денежный сценарий</CardTitle><CardDescription>Это не диагноз — только язык для наблюдения за финансовыми решениями.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Денежный сценарий</Label>
              <Select value={profile?.moneyScriptType ?? "vigilance"} onValueChange={(moneyScriptType) => changeProfile({ moneyScriptType: moneyScriptType as FinancialAutonomyProfileMoneyScriptType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCRIPT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between"><Label>Толерантность к риску</Label><span className="font-mono text-sm">{Math.round(profile?.riskToleranceIndex ?? 50)}/100</span></div>
              <Slider value={[profile?.riskToleranceIndex ?? 50]} min={0} max={100} step={5} onValueCommit={([riskToleranceIndex]) => changeProfile({ riskToleranceIndex })} />
              <p className="text-xs text-muted-foreground">0 — важнее предсказуемость, 100 — комфортнее эксперименты с контролируемым риском.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {vault?.warnings.length ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div><p className="font-semibold">Нужна проверка цифровой готовности</p><ul className="mt-1 text-sm text-muted-foreground list-disc ml-4">{vault.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileKey2 className="h-5 w-5 text-primary" /> Добавить запись в цифровой сейф</CardTitle><CardDescription>Сохраните только зашифрованный payload или ссылку на защищённый сервис. Не вводите секреты в открытом виде.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2"><Label>Категория</Label>
                <Select value={document.docCategory} onValueChange={(docCategory) => setDocument({ ...document, docCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Нейтральное название</Label><Input value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} placeholder="Например: резервный банковский план" /></div>
              <div className="space-y-2"><Label>Зашифрованный payload или ссылка</Label><Input value={document.encryptedPayload} onChange={(event) => setDocument({ ...document, encryptedPayload: event.target.value })} placeholder="opaque://secure-reference" /></div>
              <Button type="submit" disabled={createDocument.isPending}>Добавить защищённую запись</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Проверка готовности</CardTitle><CardDescription>Ни payload, ни содержимое документов здесь не отображаются.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(vault?.categoryStatus ?? []).map((status) => (
              <div key={status.category} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className={`h-5 w-5 ${status.verified ? "text-emerald-500" : "text-muted-foreground"}`} />
                  <div><p className="font-medium text-sm">{CATEGORY_LABELS[status.category]}</p><p className="text-xs text-muted-foreground">{status.verified ? "Проверено в последние 60 дней" : status.present ? "Нужно перепроверить" : "Запись отсутствует"}</p></div>
                </div>
                <span className={`text-xs font-semibold ${status.verified ? "text-emerald-500" : "text-amber-500"}`}>{status.verified ? "Готово" : "Внимание"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Сохранённые записи</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(vault?.documents ?? []).length === 0 ? <p className="text-center py-6 text-muted-foreground">Сейф пока пуст. Добавьте минимум одну безопасную ссылку или зашифрованный payload.</p> : vault?.documents.map((doc) => (
            <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
              <div><p className="font-semibold">{doc.title}</p><p className="text-sm text-muted-foreground">{CATEGORY_LABELS[doc.docCategory]} · {doc.lastVerifiedAt ? `проверено ${new Date(doc.lastVerifiedAt).toLocaleDateString("ru-RU")}` : "ещё не проверено"}</p></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => verifyDocument.mutate({ id: doc.id }, { onSuccess: refresh })}>Проверить сегодня</Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteDocument.mutate({ id: doc.id }, { onSuccess: refresh })}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}