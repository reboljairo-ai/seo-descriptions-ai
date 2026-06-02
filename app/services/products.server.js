const MIN_DESCRIPTION_LENGTH = 100;

export async function fetchProductsNeedingDescriptions(admin) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              productType
              tags
              descriptionHtml
              description
              status
            }
          }
        }
      }`,
      { variables: { cursor } }
    );

    const data = await response.json();
    const { edges, pageInfo } = data.data.products;

    for (const { node } of edges) {
      const descLength = node.description?.trim().length || 0;
      if (descLength < MIN_DESCRIPTION_LENGTH) {
        products.push({
          id: node.id,
          title: node.title,
          productType: node.productType || null,
          tags: node.tags || [],
          currentDescription: node.description || "",
          status: node.status,
        });
      }
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return products;
}

export async function applyDescriptionToProduct(admin, productId, description) {
  const response = await admin.graphql(
    `#graphql
    mutation updateProductDescription($id: ID!, $descriptionHtml: String!) {
      productUpdate(product: { id: $id, descriptionHtml: $descriptionHtml }) {
        product { id title }
        userErrors { field message }
      }
    }`,
    { variables: { id: productId, descriptionHtml: description } }
  );

  const data = await response.json();
  const errors = data.data.productUpdate.userErrors;
  if (errors.length > 0) throw new Error(errors[0].message);

  return data.data.productUpdate.product;
}
