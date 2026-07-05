import { Router, raw, json } from "express";
import Stripe from "stripe";
import { prisma } from "@repo/database";
import { redis } from "../../lib/redis";
import { createCheckoutSession } from "./billing.service";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

router.post("/checkout", json(), async (req, res) => {
  const { tenantId, priceId } = req.body;
  const session = await createCheckoutSession(tenantId, priceId);
  res.json({ url: session.url });
});

router.post("/webhook", raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  console.log("Received event type:", event.type);

  const alreadyProcessed = await redis.get(`stripe_event:${event.id}`);
  if (alreadyProcessed) {
    return res.json({ received: true });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const tenantId = sub.metadata?.tenantId;

    if (!tenantId) {
      console.warn(
        "Subscription event missing tenantId metadata, skipping",
        event.id,
      );
      await redis.setex(`stripe_event:${event.id}`, 604800, "1");
      return res.json({ received: true });
    }

    const plan = sub.status === "active" ? "PRO" : "FREE";
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan },
    });
  }

  await redis.setex(`stripe_event:${event.id}`, 604800, "1");
  res.json({ received: true });
});

export default router;
