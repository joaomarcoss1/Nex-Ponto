"use client";

import { useCallback, useEffect, useState } from "react";
import { publicJson } from "@/lib/client/public-api";

export type EmployeePortalPayload = {
  tenant: { id: string; slug: string; name: string };
  employee: { id: string; fullName: string; registrationCode?: string | null; role: string; sector?: string | null; admissionDate?: string | null };
  branch: { id: string; name: string; address?: string | null; timezone: string } | null;
  today: string;
  workSession: Record<string, unknown> | null;
  entries: Array<{ id: string; action: string; entry_timestamp: string; status: string; offline_status?: string }>;
  nextAction: string | null;
  nextActionLabel: string;
  hourBank: { balanceMinutes: number };
  schedule: { occurrences: Array<Record<string, unknown>>; fallback: Array<Record<string, unknown>> };
  requests: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  unreadNotifications: number;
};

export function useEmployeePortal() {
  const [data, setData] = useState<EmployeePortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await publicJson<EmployeePortalPayload>("/api/public/portal", { cache: "no-store" }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar seu portal.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}
