import { NextRequest } from "next/server";
import { calculateDistanceMeters } from "@/lib/calculations";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok, readJson } from "@/lib/server/http";
import { getSystemSettings } from "@/lib/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gpsReason(params: {
  branchActive: boolean;
  geofenceEnabled: boolean;
  hasBranchCoords: boolean;
  gpsReady: boolean;
  insideRadius: boolean;
  gpsAccuracyOk: boolean;
}) {
  if (!params.branchActive) return { reason: "branch_inactive", message: "Filial inativa ou não encontrada." };
  if (!params.geofenceEnabled) return { reason: "geofence_disabled", message: "A filial está com geofence desativada. Procure o RH." };
  if (!params.hasBranchCoords) return { reason: "branch_without_coordinates", message: "A filial ainda não possui latitude e longitude configuradas." };
  if (!params.gpsReady) return { reason: "branch_gps_not_confirmed", message: "A localização da filial ainda precisa ser confirmada pelo administrador." };
  if (!params.gpsAccuracyOk) return { reason: "poor_accuracy", message: "O GPS do celular está impreciso. Ative alta precisão e tente novamente." };
  if (!params.insideRadius) return { reason: "outside_radius", message: "Você está fora do raio permitido. Aproxime-se da loja e tente novamente." };
  return { reason: "ready", message: "GPS confirmado. Você está dentro do raio da filial." };
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{
      branchId?: string;
      employeeId?: string;
      latitude?: number;
      longitude?: number;
      gpsAccuracyMeters?: number;
    }>(request);

    if (!body.branchId) return fail("Selecione a filial para testar o GPS.", 400);
    if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      return fail("Não foi possível capturar sua localização atual.", 400);
    }

    const { supabase } = await requirePublicTenant(request);
    const settings = await getSystemSettings(supabase);
    const { data: branch, error } = await supabase
      .from("branches")
      .select("id,name,address,latitude,longitude,allowed_radius_meters,geofence_enabled,active,geolocation_status,gps_ready,geolocation_confirmed_at")
      .eq("id", body.branchId)
      .maybeSingle();

    if (error) return fail("Erro ao buscar filial para diagnóstico GPS.", 500, error.message);
    if (!branch) return fail("Filial não encontrada.", 404);

    const hasBranchCoords = Number.isFinite(Number(branch.latitude)) && Number.isFinite(Number(branch.longitude));
    const radiusMeters = Number(branch.allowed_radius_meters ?? settings.default_radius_meters ?? 900);
    const distanceMeters = hasBranchCoords
      ? calculateDistanceMeters(Number(body.latitude), Number(body.longitude), Number(branch.latitude), Number(branch.longitude))
      : null;
    const gpsAccuracyMeters = Number.isFinite(Number(body.gpsAccuracyMeters)) ? Math.round(Number(body.gpsAccuracyMeters)) : null;
    const maxAccuracyMeters = Number(settings.max_gps_accuracy_meters ?? 120);
    const insideRadius = typeof distanceMeters === "number" ? distanceMeters <= radiusMeters : false;
    const gpsAccuracyOk = gpsAccuracyMeters === null || gpsAccuracyMeters <= maxAccuracyMeters;
    const geofenceEnabled = branch.geofence_enabled !== false;
    const gpsReady = Boolean(branch.gps_ready) || branch.geolocation_status === "confirmed";
    const canClockIn = Boolean(branch.active && geofenceEnabled && hasBranchCoords && gpsReady && insideRadius && gpsAccuracyOk);
    const reason = gpsReason({ branchActive: Boolean(branch.active), geofenceEnabled, hasBranchCoords, gpsReady, insideRadius, gpsAccuracyOk });

    return ok({
      employee_id: body.employeeId || null,
      branch_id: branch.id,
      branch_name: branch.name,
      branch_latitude: hasBranchCoords ? Number(branch.latitude) : null,
      branch_longitude: hasBranchCoords ? Number(branch.longitude) : null,
      allowed_radius_meters: radiusMeters,
      current_latitude: Number(body.latitude),
      current_longitude: Number(body.longitude),
      gps_accuracy: gpsAccuracyMeters,
      max_gps_accuracy_meters: maxAccuracyMeters,
      calculated_distance_meters: distanceMeters,
      inside_radius: insideRadius,
      geofence_enabled: geofenceEnabled,
      geolocation_status: branch.geolocation_status || "pending",
      geolocation_confirmed_at: branch.geolocation_confirmed_at || null,
      gps_ready: gpsReady,
      can_clock_in: canClockIn,
      reason: reason.reason,
      message: reason.message,
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        latitude: hasBranchCoords ? Number(branch.latitude) : null,
        longitude: hasBranchCoords ? Number(branch.longitude) : null,
        radiusMeters,
      },
      current: {
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        gpsAccuracyMeters,
      },
      distanceMeters,
      radiusMeters,
      insideAllowedRadius: insideRadius,
      gpsAccuracyOk,
      status: canClockIn ? "ready" : reason.reason,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado no diagnóstico GPS.", 500);
  }
}
