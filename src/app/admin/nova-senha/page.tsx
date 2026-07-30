import { Suspense } from "react";
import { AdminNewPassword } from "@/components/admin/AdminNewPassword";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50">Validando acesso…</main>}>
      <AdminNewPassword />
    </Suspense>
  );
}
