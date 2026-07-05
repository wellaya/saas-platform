import { Tenant } from "@repo/database";

declare global {
  namespace Express {
    interface Request {
      tenant?: Pick<Tenant, "id" | "slug" | "plan">;
      user?: {
        sub: string;
        email: string;
        tenantId: string;
        role: string;
      };
    }
  }
}

export {};
