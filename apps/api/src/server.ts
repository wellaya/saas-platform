import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { tenantMiddleware } from "./middleware/tenant";
import { errorHandler } from "./middleware/errorHandler";
import tenantsRouter from "./modules/tenants/tenants.router";
import billingRouter from "./modules/billings/billing.router";

const app = express();

app.use(helmet());
app.use(cors());

// Billing router MUST be registered before express.json()
app.use("/api/billing", billingRouter);

// Now it's safe to parse JSON for everything else
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tenants", tenantMiddleware, tenantsRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
