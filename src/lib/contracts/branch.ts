import { z } from "zod";

export const branchSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(30).optional().nullable(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["matriz", "filial"]).default("filial"),
  address: z.string().trim().min(5).max(500),
  timezone: z.string().trim().min(3).max(80).default("America/Sao_Paulo"),
  responsible_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  allowed_radius_meters: z.coerce.number().int().min(20).max(5000).default(250),
  google_maps_url: z.string().trim().max(1000).optional().nullable(),
  map_place_id: z.string().trim().max(255).optional().nullable(),
  geofence_enabled: z.boolean().default(true),
  active: z.boolean().default(true),
});

type BranchInput = z.infer<typeof branchSchema>;
type ExistingBranch = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  allowed_radius_meters?: number | null;
  geolocation_status?: string | null;
  gps_ready?: boolean | null;
  geolocation_confirmed_at?: string | null;
  geolocation_confirmed_by?: string | null;
};

function nullableText(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function branchPayload(body: BranchInput, previous?: ExistingBranch | null) {
  const coordinatesChanged = !previous
    || Number(previous.latitude) !== body.latitude
    || Number(previous.longitude) !== body.longitude
    || Number(previous.allowed_radius_meters) !== body.allowed_radius_meters;
  return {
    code: nullableText(body.code)?.toUpperCase() || null,
    name: body.name,
    type: body.type,
    address: body.address,
    timezone: body.timezone,
    responsible_name: nullableText(body.responsible_name),
    phone: nullableText(body.phone),
    latitude: body.latitude,
    longitude: body.longitude,
    allowed_radius_meters: body.allowed_radius_meters,
    google_maps_url: nullableText(body.google_maps_url),
    map_place_id: nullableText(body.map_place_id),
    geofence_enabled: body.geofence_enabled,
    geolocation_configured_at: new Date().toISOString(),
    geolocation_status: coordinatesChanged ? "pending" : previous?.geolocation_status || "pending",
    gps_ready: coordinatesChanged ? false : Boolean(previous?.gps_ready),
    geolocation_confirmed_at: coordinatesChanged ? null : previous?.geolocation_confirmed_at || null,
    geolocation_confirmed_by: coordinatesChanged ? null : previous?.geolocation_confirmed_by || null,
    active: body.active,
  };
}
