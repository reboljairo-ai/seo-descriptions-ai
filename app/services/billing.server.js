import prisma from "../db.server.js";

const FREE_LIMIT = parseInt(process.env.FREE_PLAN_LIMIT || "10");

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(shop) {
  const month = getCurrentMonth();
  const record = await prisma.usageRecord.findUnique({
    where: { shop_month: { shop, month } },
  });
  return record?.count || 0;
}

export async function incrementUsage(shop) {
  const month = getCurrentMonth();
  await prisma.usageRecord.upsert({
    where: { shop_month: { shop, month } },
    update: { count: { increment: 1 } },
    create: { shop, month, count: 1 },
  });
}

export async function getSubscription(shop) {
  return prisma.subscription.findUnique({ where: { shop } });
}

export async function isPaidPlan(shop) {
  const sub = await getSubscription(shop);
  return sub?.plan === "paid" && sub?.status === "active";
}

export async function canGenerateMore(shop) {
  const paid = await isPaidPlan(shop);
  if (paid) return true;
  const usage = await getUsage(shop);
  return usage < FREE_LIMIT;
}

export async function createSubscriptionCharge(admin, shop, returnUrl) {
  let isTest = false;
  try {
    const shopQuery = await admin.graphql(`
      query { shop { plan { partnerDevelopment } } }
    `);
    const shopData = await shopQuery.json();
    isTest = shopData.data?.shop?.plan?.partnerDevelopment ?? false;
  } catch {
    // Default to non-test; production stores don't need test mode
  }

  const response = await admin.graphql(
    `#graphql
    mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
        trialDays: $trialDays
      ) {
        appSubscription { id status }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      variables: {
        name: "SEOscribe — Pro Plan",
        returnUrl,
        test: isTest,
        trialDays: 7,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: 19.0, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const data = await response.json();
  const result = data.data?.appSubscriptionCreate;
  if (!result) throw new Error(`GraphQL error: ${JSON.stringify(data.errors ?? data)}`);
  const { confirmationUrl, userErrors } = result;
  if (userErrors?.length > 0) throw new Error(userErrors[0].message);
  if (!confirmationUrl) throw new Error("No se recibió URL de confirmación de Shopify");
  return confirmationUrl;
}

export async function activateSubscription(shop, chargeId) {
  await prisma.subscription.upsert({
    where: { shop },
    update: { plan: "paid", chargeId, status: "active" },
    create: { shop, plan: "paid", chargeId, status: "active" },
  });
}
