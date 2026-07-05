import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { prisma } from "@repo/database";

const router = Router();

router.get("/me", authMiddleware, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.tenant!.id },
    include: { users: { include: { user: true } } },
  });
  res.json(tenant);
});

router.post("/", async (req, res) => {
  const { name, slug, ownerEmail } = req.body;
  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      users: {
        create: {
          role: "OWNER",
          user: { connect: { email: ownerEmail } },
        },
      },
    },
  });
  res.status(201).json(tenant);
});

export default router;
