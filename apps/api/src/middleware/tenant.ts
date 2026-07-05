/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from "express";
import { prisma } from "@repo/database";

export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const slug =
    (req.headers["x-tenant-slug"] as string) || req.hostname.split(".")[0];

  if (!slug || slug === "www" || slug === "api") {
    return next(); // public routes — no tenant required
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });

  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  req.tenant = tenant;
  next();
}
