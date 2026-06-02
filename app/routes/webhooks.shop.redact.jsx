import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  // Delete all shop data when a shop requests redaction
  await prisma.productDescription.deleteMany({ where: { shop } });
  await prisma.usageRecord.deleteMany({ where: { shop } });
  await prisma.subscription.deleteMany({ where: { shop } });
  return new Response();
};
