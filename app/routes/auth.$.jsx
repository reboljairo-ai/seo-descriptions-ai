import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const GDPR_WEBHOOKS = [
  { topic: "CUSTOMERS_DATA_REQUEST", callbackUrl: "/webhooks/customers/data_request" },
  { topic: "CUSTOMERS_REDACT",       callbackUrl: "/webhooks/customers/redact" },
  { topic: "SHOP_REDACT",            callbackUrl: "/webhooks/shop/redact" },
];

const REGISTER_WEBHOOK = `#graphql
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

async function registerGdprWebhooks(admin, appUrl) {
  for (const { topic, callbackUrl } of GDPR_WEBHOOKS) {
    try {
      await admin.graphql(REGISTER_WEBHOOK, {
        variables: {
          topic,
          webhookSubscription: {
            callbackUrl: `${appUrl}${callbackUrl}`,
            format: "JSON",
          },
        },
      });
    } catch (e) {
      console.error(`Failed to register ${topic}:`, e.message);
    }
  }
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const appUrl = process.env.SHOPIFY_APP_URL || "";
  registerGdprWebhooks(admin, appUrl).catch(console.error);

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
