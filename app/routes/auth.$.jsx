import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, registerWebhooks } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  if (session) {
    try {
      await registerWebhooks({ session });
    } catch (e) {
      console.error("Webhook registration error:", e.message);
    }
  }

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
