import { z } from "zod";

export const createTenantRequestSchema = z.object({
  legalName: z.string().trim().min(3).max(180),
  displayName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  timezone: z.string().trim().min(3).max(80).default("America/Sao_Paulo"),
  planCode: z.string().trim().default("professional"),
  ownerName: z.string().trim().min(3).max(150),
  ownerEmail: z.string().email(),
});

export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export type CreateTenantResponse = {
  tenant: {
    id: string;
    displayName: string;
    slug: string;
    publicCode: string;
    status: string;
  };
  owner: {
    id: string;
    email: string;
  };
  inviteSent: boolean;
  duplicated?: boolean;
};

