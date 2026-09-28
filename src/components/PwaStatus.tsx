"use client";

import { Download, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

const INSTALL_DISMISSED_KEY = "nexponto_pwa_install_dismissed";

export function PwaStatus() {
  const [offline, setOffline] = useState(false);
  const [prompt, setPrompt] = useState<any>(null);
  const [installDismissed, setInstallDismissed] = useState(true);

  useEffect(() => {
    setOffline(!navigator.onLine);
    try {
      setInstallDismissed(window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1");
    } catch {
      setInstallDismissed(false);
    }
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

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // localStorage unavailable (private mode, blocked storage) — dismissal just won't persist across reloads.
    }
  }

  if (offline) {
    return (
      <div className="fixed left-4 right-4 top-4 z-40 mx-auto flex max-w-xl items-center gap-2 rounded-lg border border-red-200 bg-white p-3 text-sm font-bold text-slate-700 shadow-soft dark:border-red-900 dark:bg-slate-800 dark:text-slate-200">
        <WifiOff className="h-4 w-4 shrink-0 text-red-600" />
        <span className="min-w-0">Você está offline. Pontos oficiais exigem GPS e sincronização.</span>
      </div>
    );
  }

  if (!prompt || installDismissed) return null;
  return (
    <div className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-1.5 pl-3 pr-1.5 text-xs font-bold text-slate-600 shadow-soft backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 lg:bottom-4">
      <Download className="h-3.5 w-3.5 shrink-0 text-brand-700 dark:text-brand-400" />
      <button type="button" onClick={install} className="shrink-0 text-brand-700 hover:underline dark:text-brand-400">
        Instalar app
      </button>
      <button
        type="button"
        onClick={dismissInstall}
        aria-label="Dispensar sugestão de instalação"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
