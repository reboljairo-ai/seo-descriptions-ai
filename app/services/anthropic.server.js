import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateSEODescription(productTitle, productType, tags) {
  const context = [productType, tags?.join(", ")].filter(Boolean).join(" | ");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Write a compelling, SEO-optimized product description for a Shopify store.

Product: ${productTitle}
${context ? `Category/Tags: ${context}` : ""}

Requirements:
- 80-120 words
- Include relevant keywords naturally
- Focus on benefits, not just features
- Engaging and persuasive tone
- No markdown formatting, plain text only
- Do not include the product title at the start

Reply with ONLY the description text.`,
      },
    ],
  });

  return message.content[0].text.trim();
}
