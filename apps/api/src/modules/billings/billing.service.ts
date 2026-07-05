import Stripe from "stripe";
import { prisma } from "@repo/database";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(
  tenantId: string,
  priceId: string,
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  console.log("Creating checkout for tenant:", tenant);
  console.log("Using priceId:", priceId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `https://${tenant.slug}.yoursaas.com/billing?success=1`,
    cancel_url: `https://${tenant.slug}.yoursaas.com/billing`,
    metadata: { tenantId },
    subscription_data: {
      metadata: { tenantId },
    },
  });

  return session;
}
