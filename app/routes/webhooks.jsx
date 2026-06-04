import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      break;
    case "CUSTOMERS_REDACT":
      break;
    case "SHOP_REDACT":
      await prisma.productDescription.deleteMany({ where: { shop } });
      await prisma.usageRecord.deleteMany({ where: { shop } });
      await prisma.subscription.deleteMany({ where: { shop } });
      break;
  }

  return new Response();
};
