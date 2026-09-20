import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTenantScopedClient } from "@/lib/server/tenant-scoped-client";

function fakeClient() {
  const eq = vi.fn(() => ({ eq }));
  const update = vi.fn(() => ({ eq }));
  const insert = vi.fn(() => ({ eq }));
  const upsert = vi.fn(() => ({ eq }));
  const select = vi.fn(() => ({ eq }));
  const remove = vi.fn(() => ({ eq }));
  return {
    client: { from: vi.fn(() => ({ update, insert, upsert, select, delete: remove })) } as unknown as SupabaseClient,
    eq,
    update,
    insert,
  };
}

describe("tenant scoped service-role adapter", () => {
  it("rejects tenant_id in every generic update", () => {
    const { client } = fakeClient();
    const scoped = createTenantScopedClient(client, "tenant-a");
    expect(() => scoped.from("employees").update({ tenant_id: "tenant-b" })).toThrowError(/imutável/);
    expect(() => scoped.from("employees").update({ tenant_id: "tenant-a" })).toThrowError(/imutável/);
  });

  it("injects the tenant filter into safe updates", () => {
    const { client, update, eq } = fakeClient();
    const scoped = createTenantScopedClient(client, "tenant-a");
    scoped.from("employees").update({ active: false });
    expect(update).toHaveBeenCalledWith({ active: false }, undefined);
    expect(eq).toHaveBeenCalledWith("tenant_id", "tenant-a");
  });

  it("rejects cross-tenant inserts before reaching Supabase", () => {
    const { client, insert } = fakeClient();
    const scoped = createTenantScopedClient(client, "tenant-a");
    expect(() => scoped.from("employees").insert({ tenant_id: "tenant-b" })).toThrowError(/empresa diferente/);
    expect(insert).not.toHaveBeenCalled();
  });
});
