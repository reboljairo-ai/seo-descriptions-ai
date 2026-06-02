import { redirect } from "react-router";
import { authenticate } from "../shopify.server.js";
import { activateSubscription } from "../services/billing.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (chargeId) {
    await activateSubscription(shop, chargeId);
  }

  return redirect("/app?upgraded=1");
};
