import { useState } from "react";
import { 
  useAnalyzeFinances, 
  AIAnalysisResult,
  AIOptimizationUrgency,
  AIRiskAlertSeverity
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainCircuit, Loader2, Zap, AlertOctagon, TrendingUp, Activity, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const URGENCY_LABELS: Record<string, string> = {
  critical: "критично",
  high: "высокий",
  medium: "средний",
  low: "низкий",
};

export default function AIAdvisor() {
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const analyze = useAnalyzeFinances();

  const handleAnalyze = () => {
    analyze.mutate({ data: {} }, {
      onSuccess: (data) => {
        setAnalysis(data);
      }
    });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "critical": return "text-destructive border-destructive bg-destructive/10";
      case "high": return "text-amber-500 border-amber-500 bg-amber-500/10";
      case "medium": return "text-primary border-primary bg-primary/10";
      case "low": return "text-emerald-500 border-emerald-500 bg-emerald-500/10";
      default: return "text-muted-foreground";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <ShieldAlert className="h-5 w-5 text-destructive" />;
      case "warning": return <AlertOctagon className="h-5 w-5 text-amber-500" />;
      case "info": return <CheckCircle2 className="h-5 w-5 text-primary" />;
      default: return <Activity className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ИИ-Стратег</h1>
          <p className="text-muted-foreground mt-1">Глубокий компьютерный анализ вашего финансового здоровья.</p>
        </div>
        <Button 
          size="lg" 
          onClick={handleAnalyze} 
          disabled={analyze.isPending}
          className="font-bold uppercase tracking-wider group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-primary/20 group-hover:bg-transparent transition-colors z-0"></div>
          {analyze.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin z-10 relative" /> Обработка данных...</>
          ) : (
            <><BrainCircuit className="mr-2 h-5 w-5 z-10 relative" /> Полный анализ</>
          )}
        </Button>
      </div>

      {!analysis && !analyze.isPending && (
        <Card className="border-dashed border-2 bg-transparent text-center p-12">
          <BrainCircuit className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
          <h3 className="text-xl font-bold mb-2">Ожидание расчёта</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Запустите полный анализ для получения персональных стратегий оптимизации, предупреждений о рисках и системного показателя здоровья на основе ваших данных.
          </p>
        </Card>
      )}

      {analyze.isPending && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-50 animate-pulse">
          <Card className="h-64"></Card>
          <Card className="h-64"></Card>
          <Card className="md:col-span-2 h-40"></Card>
        </div>
      )}

      {analysis && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-gradient-to-br from-card to-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  Сводный анализ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg leading-relaxed text-foreground/90 font-medium">
                  {analysis.summary}
                </p>
              </CardContent>
            </Card>

            <Card className="flex flex-col items-center justify-center p-6 text-center border-border">
              <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Индекс финансового здоровья</div>
              <div className="relative flex items-center justify-center w-40 h-40 rounded-full border-[12px] border-muted shadow-inner">
                <div 
                  className={`absolute inset-0 rounded-full border-[12px] ${
                    analysis.overallHealthScore > 80 ? 'border-emerald-500' :
                    analysis.overallHealthScore > 50 ? 'border-amber-500' : 'border-destructive'
                  }`}
                  style={{
                    clipPath: `polygon(0 0, 100% 0, 100% ${100 - analysis.overallHealthScore}%, 0 100%)`,
                    transform: 'rotate(-45deg)'
                  }}
                ></div>
                <div className="z-10 flex flex-col items-center">
                  <span className="text-5xl font-black">{analysis.overallHealthScore}</span>
                  <span className="text-xs font-bold text-muted-foreground uppercase mt-1">/ 100</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                Стратегические оптимизации
              </h3>
              {analysis.optimizations.map((opt, i) => (
                <Card key={i} className="hover-elevate border-border group transition-colors hover:border-emerald-500/30">
                  <CardContent className="p-5 flex gap-4">
                    <div className="mt-1">
                      <Zap className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-foreground">{opt.title}</h4>
                        <Badge variant="outline" className={`uppercase text-[10px] font-bold ${getUrgencyColor(opt.urgency)}`}>
                          {URGENCY_LABELS[opt.urgency] ?? opt.urgency}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{opt.description}</p>
                      {opt.estimatedMonthlySaving > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded text-xs font-bold uppercase">
                          Прогнозная экономия: +{formatCurrency(opt.estimatedMonthlySaving)}/мес
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-destructive" />
                Разведка рисков
              </h3>
              {analysis.riskAlerts.map((risk, i) => (
                <Card key={i} className={`hover-elevate border-border group transition-colors ${risk.severity === 'critical' ? 'hover:border-destructive/50 border-destructive/20 bg-destructive/5' : ''}`}>
                  <CardContent className="p-5 flex gap-4">
                    <div className="mt-1">
                      {getSeverityIcon(risk.severity)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-foreground">{risk.title}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">{risk.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {analysis.riskAlerts.length === 0 && (
                <Card className="p-6 text-center border-dashed text-muted-foreground">
                  Системных рисков не обнаружено. Текущая стратегия стабильна.
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
