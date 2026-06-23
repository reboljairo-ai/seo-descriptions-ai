import { redirect } from "react-router";
import { activateSubscription } from "../services/billing.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  if (shop && chargeId) {
    await activateSubscription(shop, chargeId);
    const shopName = shop.replace(".myshopify.com", "");
    return redirect(
      `https://admin.shopify.com/store/${shopName}/apps/${process.env.SHOPIFY_API_KEY}?upgraded=1`
    );
  }

  return redirect("/");
};
