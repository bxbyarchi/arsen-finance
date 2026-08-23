import React, { useState, useRef, useEffect } from "react";
import { 
  useSendAdvisorChatMessage, 
  AdvisorChatResult,
  AdvisorChatHistoryItem,
  AdvisorChatHistoryItemRole
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { 
  BrainCircuit, 
  Send, 
  Loader2, 
  Info, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle, 
  Zap, 
  CornerDownRight 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const fmt = (val: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(val)) + "\u00a0сом";

type LocalMessage = {
  id: string;
  role: AdvisorChatHistoryItemRole;
  content: string;
  result?: AdvisorChatResult;
  isError?: boolean;
};

const QUICK_PROMPTS = [
  "Хочу купить одежду на 10 000 сом, можно?",
  "Оцени риск покупки оборудования",
  "Сколько свободных денег до конца месяца?",
  "Как быстро закрыть долги?"
];

function VerdictBadge({ verdict }: { verdict: string }) {
  switch (verdict) {
    case "YES":
      return <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-widest"><CheckCircle className="w-3.5 h-3.5" /> Можно</div>;
    case "NO":
      return <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/15 text-destructive text-xs font-bold uppercase tracking-widest"><AlertCircle className="w-3.5 h-3.5" /> Не стоит</div>;
    case "PARTIAL":
      return <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-500 text-xs font-bold uppercase tracking-widest"><AlertTriangle className="w-3.5 h-3.5" /> С осторожностью</div>;
    case "INFO":
    default:
      return <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold uppercase tracking-widest"><Info className="w-3.5 h-3.5" /> Анализ</div>;
  }
}

function ContextStat({ label, value }: { label: string, value: number }) {
  return (
    <div className="flex flex-col bg-background/50 border border-border/40 rounded-xl p-2.5">
      <span className="text-[11px] text-muted-foreground font-semibold mb-0.5 truncate">{label}</span>
      <span className="text-sm font-bold text-foreground">{fmt(value)}</span>
    </div>
  );
}

export default function AIAdvisor() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const chatMutation = useSendAdvisorChatMessage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMsg: LocalMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: trimmed
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    const history: AdvisorChatHistoryItem[] = messages
      .filter(m => !m.isError)
      .map(m => ({ role: m.role, content: m.content }));

    chatMutation.mutate(
      { data: { message: trimmed, history } },
      {
        onSuccess: (data) => {
          const assistantMsg: LocalMessage = {
            id: Math.random().toString(36).substring(7),
            role: 'assistant',
            content: data.responseText,
            result: data
          };
          setMessages(prev => [...prev, assistantMsg]);
        },
        onError: () => {
          const errorMsg: LocalMessage = {
            id: Math.random().toString(36).substring(7),
            role: 'assistant',
            content: "Произошла ошибка при анализе. Пожалуйста, попробуйте еще раз.",
            isError: true
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      }
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] min-h-[600px] w-full max-w-5xl mx-auto bg-gradient-to-b from-card to-primary/[0.02] border border-border shadow-sm rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="p-4 border-b border-border bg-card/50 backdrop-blur-sm flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
          <BrainCircuit className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">Финансовый советник</h1>
          <p className="text-xs font-medium text-muted-foreground">Умный анализ в реальном времени</p>
        </div>
      </div>
      
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-700">
            <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center text-primary mb-6 ring-8 ring-primary/5">
              <BrainCircuit className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold mb-3 tracking-tight">Чем могу помочь?</h2>
            <p className="text-muted-foreground/80 mb-8 leading-relaxed">
              Я могу проанализировать ваши расходы, оценить финансовые риски покупок или подсказать, как лучше распределить бюджет до конца месяца.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="text-left p-4 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all duration-200 group flex flex-col justify-between gap-3 shadow-sm hover:shadow"
                >
                  <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors leading-snug">
                    {prompt}
                  </span>
                  <div className="w-full flex justify-end">
                    <div className="w-6 h-6 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <CornerDownRight className="w-3 h-3 text-primary/50 group-hover:text-primary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto w-full pb-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                
                if (isUser) {
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-4 max-w-[85%] ml-auto justify-end"
                    >
                      <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm">
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </motion.div>
                  );
                }

                if (msg.isError) {
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3 max-w-[85%]"
                    >
                      <div className="w-8 h-8 rounded-full bg-destructive/10 flex-shrink-0 flex items-center justify-center text-destructive mt-1">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="bg-destructive/5 border border-destructive/20 text-destructive rounded-2xl rounded-tl-sm px-5 py-3.5 shadow-sm">
                        <p className="text-[15px] leading-relaxed">{msg.content}</p>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 max-w-[95%]"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary mt-1 shadow-inner ring-1 ring-primary/20">
                      <BrainCircuit className="w-4 h-4" />
                    </div>
                    <div className="space-y-3 flex-1">
                      {msg.result ? (
                        <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-5 shadow-sm space-y-4">
                          <div className="flex items-start justify-between gap-4">
                             <VerdictBadge verdict={msg.result.verdict} />
                          </div>
                          
                          <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
                            {msg.result.responseText}
                          </p>

                          {msg.result.reasoning && (
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-amber-500" /> Ход мыслей
                              </div>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                {msg.result.reasoning}
                              </p>
                            </div>
                          )}

                          {msg.result.context && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border/50 mt-4">
                              <ContextStat label="Можно тратить" value={msg.result.context.safeToSpendNow} />
                              <ContextStat label="Обязательства" value={msg.result.context.upcomingObligations} />
                              <ContextStat label="Долги (мес)" value={msg.result.context.debtObligations} />
                              <ContextStat label="Ликвидность" value={msg.result.context.liquidity} />
                            </div>
                          )}
                          
                          {msg.result.action && (
                            <div className="pt-2">
                              <div className="inline-flex items-center gap-2 text-[13px] font-medium text-primary bg-primary/5 px-3 py-2 rounded-lg border border-primary/10">
                                <CornerDownRight className="w-4 h-4" />
                                {msg.result.action}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-5 py-3.5 shadow-sm">
                           <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {chatMutation.isPending && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 max-w-[85%]"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary mt-1">
                    <BrainCircuit className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground font-medium animate-pulse">Анализирую данные...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-card border-t border-border z-10">
        <div className="relative max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Задайте вопрос о ваших финансах..."
            className="w-full min-h-[56px] max-h-32 resize-none bg-muted/40 focus:bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-2xl py-3.5 pl-4 pr-14 text-[15px] outline-none transition-all shadow-inner"
            rows={1}
          />
          <Button 
            size="icon"
            className="absolute right-2.5 bottom-2.5 h-9 w-9 rounded-xl shadow-sm"
            disabled={!input.trim() || chatMutation.isPending}
            onClick={() => handleSend(input)}
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
        <div className="text-center mt-3">
          <span className="text-[11px] font-medium text-muted-foreground/70">
            ИИ может допускать ошибки. Учитывайте это при принятии решений.
          </span>
        </div>
      </div>
      
    </div>
  );
}
