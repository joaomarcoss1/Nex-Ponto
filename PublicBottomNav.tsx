"use client";

import { CalendarDays, Clock3, Home, Repeat2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const items = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/", label: "Ponto", icon: Clock3 },
  { href: "/escala", label: "Escala", icon: CalendarDays },
  { href: "/solicitacoes", label: "Pedidos", icon: Repeat2 },
  { href: "/perfil", label: "Perfil", icon: UserRound },
];

export function PublicBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] backdrop-blur md:hidden" aria-label="Navegação do funcionário">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={clsx("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center text-[10px] font-black leading-tight transition", active ? "bg-brand-600 text-white shadow-[0_10px_24px_rgba(18,104,243,.24)]" : "text-slate-600 hover:bg-brand-50 hover:text-brand-800")}><Icon className="h-5 w-5" /><span>{item.label}</span></Link>;
        })}
      </div>
    </nav>
  );
}
