"use client";

import { Download, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PwaStatus() {
  const [offline, setOffline] = useState(false);
  const [prompt, setPrompt] = useState<any>(null);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
  }

  if (!offline && !prompt) return null;
  return (
    <div className="fixed left-4 right-4 top-4 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
        {offline ? <WifiOff className="h-4 w-4 text-red-600" /> : <Download className="h-4 w-4 text-brand-700" />}
        {offline ? "Você está offline. Pontos oficiais exigem GPS e sincronização." : "Instalar app no celular"}
      </div>
      {prompt ? (
        <Button size="sm" onClick={install}>
          Instalar
        </Button>
      ) : null}
    </div>
  );
}
