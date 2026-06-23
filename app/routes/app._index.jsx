import { useFetcher, useLoaderData } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { fetchProductsNeedingDescriptions, applyDescriptionToProduct } from "../services/products.server.js";
import { getUsage, isPaidPlan, canGenerateMore, incrementUsage, createSubscriptionCharge } from "../services/billing.server.js";
import { generateSEODescription } from "../services/anthropic.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const justUpgraded = url.searchParams.get("upgraded") === "1";

  const [products, pending, usage, paid] = await Promise.all([
    fetchProductsNeedingDescriptions(admin),
    prisma.productDescription.findMany({ where: { shop, status: "pending" } }),
    getUsage(shop),
    isPaidPlan(shop),
  ]);

  const approved = await prisma.productDescription.findMany({
    where: { shop, status: "approved" },
  });

  return { products, pending, approved, usage, paid, shop, justUpgraded, limit: parseInt(process.env.FREE_PLAN_LIMIT || "10") };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "upgrade") {
    try {
      const appUrl = process.env.SHOPIFY_APP_URL || `${new URL(request.url).protocol}//${new URL(request.url).host}`;
      const returnUrl = `${appUrl}/app/billing/callback?shop=${encodeURIComponent(shop)}`;
      const confirmationUrl = await createSubscriptionCharge(admin, shop, returnUrl);
      return { confirmationUrl };
    } catch (err) {
      return { error: `Error al crear la suscripción: ${err.message}` };
    }
  }

  if (intent === "generate") {
    const canGen = await canGenerateMore(shop);
    if (!canGen) return { error: "Has alcanzado el límite gratuito de este mes. Actualiza a Pro para continuar." };

    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const productType = formData.get("productType");
    const tags = JSON.parse(formData.get("tags") || "[]");

    const description = await generateSEODescription(productTitle, productType, tags);

    await prisma.productDescription.upsert({
      where: { shop_productId: { shop, productId } },
      update: { generatedDesc: description, status: "pending", productTitle, productType },
      create: { shop, productId, productTitle, productType, generatedDesc: description },
    });

    await incrementUsage(shop);
    return { success: true, productId };
  }

  if (intent === "approve") {
    const productId = formData.get("productId");
    await prisma.productDescription.update({
      where: { shop_productId: { shop, productId } },
      data: { status: "approved" },
    });
    return { success: true };
  }

  if (intent === "reject") {
    const productId = formData.get("productId");
    await prisma.productDescription.delete({
      where: { shop_productId: { shop, productId } },
    });
    return { success: true };
  }

  if (intent === "applyAll") {
    const approved = await prisma.productDescription.findMany({
      where: { shop, status: "approved" },
    });

    const results = await Promise.allSettled(
      approved.map(async (item) => {
        await applyDescriptionToProduct(admin, item.productId, item.generatedDesc);
        await prisma.productDescription.update({
          where: { id: item.id },
          data: { status: "applied", appliedAt: new Date() },
        });
      })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    return { success: true, applied: approved.length - failed, failed };
  }

  return { error: "Acción no reconocida" };
};

export default function Index() {
  const { products, pending, approved, usage, paid, limit, justUpgraded } = useLoaderData();
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const submit = (data) => fetcher.submit(data, { method: "POST" });

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_top");
    }
  }, [fetcher.data]);

  return (
    <s-page heading="SEO Descriptions AI">
      {/* Plan banner */}
      <s-section slot="aside" heading="Tu plan">
        <s-paragraph>
          <s-text>Plan: </s-text>
          <s-badge tone={paid ? "success" : "info"}>{paid ? "Pro — Ilimitado" : "Gratis"}</s-badge>
        </s-paragraph>
        {!paid && (
          <s-paragraph>
            <s-text>Uso este mes: {usage} / {limit} productos</s-text>
          </s-paragraph>
        )}
        {!paid && (
          <s-button
            tone="success"
            onClick={() => submit({ intent: "upgrade" })}
          >
            Actualizar a Pro — $19/mes
          </s-button>
        )}
      </s-section>

      {/* Upgrade success */}
      {justUpgraded && (
        <s-banner tone="success">
          <s-paragraph>Bienvenido al plan Pro. Ahora puedes generar descripciones ilimitadas.</s-paragraph>
        </s-banner>
      )}

      {/* Error / success feedback */}
      {fetcher.data?.error && (
        <s-banner tone="critical">
          <s-paragraph>{fetcher.data.error}</s-paragraph>
        </s-banner>
      )}
      {fetcher.data?.applied > 0 && (
        <s-banner tone="success">
          <s-paragraph>{fetcher.data.applied} descripcion(es) aplicadas correctamente.</s-paragraph>
        </s-banner>
      )}

      {/* Approved — ready to apply */}
      {approved.length > 0 && (
        <s-section heading={`Aprobadas y listas para aplicar (${approved.length})`}>
          <s-button
            tone="success"
            loading={isLoading}
            onClick={() => submit({ intent: "applyAll" })}
          >
            Aplicar todas a la tienda
          </s-button>
          {approved.map((item) => (
            <s-box key={item.productId} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text emphasis="strong">{item.productTitle}</s-text>
                <s-paragraph>{item.generatedDesc}</s-paragraph>
                <s-stack direction="inline" gap="tight">
                  <s-button
                    tone="critical"
                    variant="tertiary"
                    onClick={() => submit({ intent: "reject", productId: item.productId })}
                  >
                    Eliminar
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          ))}
        </s-section>
      )}

      {/* Pending review */}
      {pending.length > 0 && (
        <s-section heading={`Generadas — pendientes de revisión (${pending.length})`}>
          {pending.map((item) => (
            <s-box key={item.productId} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text emphasis="strong">{item.productTitle}</s-text>
                <s-paragraph>{item.generatedDesc}</s-paragraph>
                <s-stack direction="inline" gap="tight">
                  <s-button
                    tone="success"
                    onClick={() => submit({ intent: "approve", productId: item.productId })}
                  >
                    Aprobar
                  </s-button>
                  <s-button
                    onClick={() =>
                      submit({
                        intent: "generate",
                        productId: item.productId,
                        productTitle: item.productTitle,
                        productType: item.productType || "",
                        tags: "[]",
                      })
                    }
                    loading={isLoading}
                  >
                    Regenerar
                  </s-button>
                  <s-button
                    tone="critical"
                    variant="tertiary"
                    onClick={() => submit({ intent: "reject", productId: item.productId })}
                  >
                    Rechazar
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          ))}
        </s-section>
      )}

      {/* Products needing descriptions */}
      <s-section heading={`Productos sin descripción (${products.length})`}>
        {products.length === 0 ? (
          <s-paragraph>Todos tus productos tienen descripción. ¡Genial!</s-paragraph>
        ) : (
          products.map((product) => (
            <s-box key={product.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base">
                <s-stack direction="block" gap="tight">
                  <s-text emphasis="strong">{product.title}</s-text>
                  {product.productType && (
                    <s-text tone="subdued">{product.productType}</s-text>
                  )}
                  {product.currentDescription && (
                    <s-text tone="subdued">
                      Descripción actual: {product.currentDescription.slice(0, 60)}...
                    </s-text>
                  )}
                </s-stack>
                <s-button
                  loading={isLoading}
                  onClick={() =>
                    submit({
                      intent: "generate",
                      productId: product.id,
                      productTitle: product.title,
                      productType: product.productType || "",
                      tags: JSON.stringify(product.tags),
                    })
                  }
                >
                  Generar descripción
                </s-button>
              </s-stack>
            </s-box>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
