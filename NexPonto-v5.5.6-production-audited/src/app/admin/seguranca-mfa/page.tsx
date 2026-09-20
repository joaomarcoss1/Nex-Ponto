import { redirect } from "next/navigation";

/**
 * Compatibilidade para favoritos e versões antigas da PWA.
 * A autenticação administrativa atual usa somente e-mail e senha.
 */
export default function LegacyMfaRoute() {
  redirect("/admin");
}
