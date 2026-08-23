import { useState, useEffect } from "react";
import {
  useGetTelegramLinkStatus,
  getGetTelegramLinkStatusQueryKey,
  useCreateTelegramLinkToken,
  useUnlinkTelegramAccount,
  TelegramLinkToken
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  Copy,
  ExternalLink,
  Unplug,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeToken, setActiveToken] = useState<TelegramLinkToken | null>(null);

  const { data: status, isLoading, isError, refetch } = useGetTelegramLinkStatus({
    query: {
      queryKey: getGetTelegramLinkStatusQueryKey(),
      refetchInterval: activeToken ? 3000 : false
    }
  });

  const createToken = useCreateTelegramLinkToken();
  const unlinkAccount = useUnlinkTelegramAccount();

  // If status changes to connected, clear active token
  useEffect(() => {
    if (status?.connected && activeToken) {
      setActiveToken(null);
      toast({
        title: "Telegram подключен",
        description: "Ваш аккаунт успешно связан.",
      });
    }
  }, [status?.connected, activeToken, toast]);

  // Clear token if it expires
  useEffect(() => {
    if (!activeToken) return;
    const expires = new Date(activeToken.expiresAt).getTime();
    const now = Date.now();
    const msUntilExpiry = expires - now;

    if (msUntilExpiry <= 0) {
      setActiveToken(null);
      toast({
        title: "Код истек",
        description: "Время действия кода вышло. Сгенерируйте новый.",
      });
      return;
    }

    const timer = setTimeout(() => {
      setActiveToken(null);
      toast({
        title: "Код истек",
        description: "Время действия кода вышло. Сгенерируйте новый.",
      });
    }, msUntilExpiry);

    return () => clearTimeout(timer);
  }, [activeToken, toast]);

  const handleCreateToken = () => {
    createToken.mutate(undefined, {
      onSuccess: (token) => {
        setActiveToken(token);
      },
      onError: () => {
        toast({
          title: "Ошибка",
          description: "Не удалось создать код подключения. Попробуйте еще раз.",
          variant: "destructive"
        });
      }
    });
  };

  const handleUnlink = () => {
    unlinkAccount.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Отключено",
          description: "Учетная запись Telegram отвязана."
        });
        queryClient.invalidateQueries({ queryKey: getGetTelegramLinkStatusQueryKey() });
      },
      onError: () => {
        toast({
          title: "Ошибка",
          description: "Не удалось отвязать аккаунт.",
          variant: "destructive"
        });
      }
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Скопировано",
        description: "Команда скопирована в буфер обмена."
      });
    } catch (err) {
      toast({
        title: "Не удалось скопировать",
        description: "Пожалуйста, выделите текст и скопируйте его вручную.",
        variant: "destructive"
      });
    }
  };

  const isConnected = status?.connected ?? false;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Настройки</h1>
        <p className="text-muted-foreground mt-2">Управление интеграциями и параметрами системы.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-sidebar-border bg-card/50 backdrop-blur-sm shadow-sm relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-xl">Интеграция с Telegram</CardTitle>
                <CardDescription className="mt-1">
                  Свяжите бота для быстрого учета расходов и получения отчетов
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Проверка статуса подключения...</span>
              </div>
            ) : isError ? (
              <div className="flex flex-col gap-3 p-4 bg-destructive/10 text-destructive rounded-md">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-5 h-5" />
                  <span>Ошибка загрузки</span>
                </div>
                <p className="text-sm opacity-90">Не удалось получить статус подключения. Проверьте соединение.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="w-fit mt-2">
                  <RefreshCcw className="w-4 h-4 mr-2" /> Повторить
                </Button>
              </div>
            ) : isConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                  <div className="flex-1">
                    <p className="font-medium">Учетная запись привязана</p>
                    <p className="text-sm opacity-80 mt-0.5">Теперь вы можете управлять финансами прямо из Telegram.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted rounded-md border border-border">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Нет подключения</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Бот ожидает привязки к вашему аккаунту.</p>
                  </div>
                </div>

                {!activeToken ? (
                  <Button 
                    onClick={handleCreateToken} 
                    disabled={createToken.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {createToken.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Создание кода...</>
                    ) : (
                      "Сгенерировать код для подключения"
                    )}
                  </Button>
                ) : (
                  <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="p-4 bg-card border rounded-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <MessageCircle className="w-16 h-16" />
                      </div>
                      <p className="text-sm font-medium mb-3 relative z-10 text-foreground">
                        Отправьте эту команду нашему боту:
                      </p>
                      
                      <div className="flex items-center gap-2 relative z-10">
                         <code className="flex-1 block break-all p-3 bg-muted rounded font-mono text-sm border font-semibold text-primary">
                          {activeToken.command}
                        </code>
                        <Button variant="outline" size="icon" className="h-[46px] w-[46px] shrink-0" onClick={() => copyToClipboard(activeToken.command)} title="Скопировать">
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground relative z-10">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Истекает {formatDistanceToNow(new Date(activeToken.expiresAt), { locale: ru, addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button 
                        variant="default" 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => window.open(activeToken.deepLink, "_blank")}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Открыть Telegram
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={handleCreateToken}
                        disabled={createToken.isPending}
                        title="Обновить код"
                      >
                        <RefreshCcw className={`w-4 h-4 ${createToken.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    
                    <p className="text-xs text-center text-muted-foreground pt-2">
                      Ожидаем подключения... (обновляется автоматически)
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          {isConnected && (
            <CardFooter className="bg-muted/50 border-t p-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Если вы потеряли доступ к Telegram, отвяжите аккаунт.</span>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleUnlink}
                disabled={unlinkAccount.isPending}
              >
                {unlinkAccount.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Unplug className="w-4 h-4 mr-2" />
                )}
                Отключить
              </Button>
            </CardFooter>
          )}
        </Card>
        
      </div>
    </div>
  );
}
