import { groqCompletion, groqConfigured } from "../assistant/groqChat";
import type { ProductCategory } from "./product.model";

function attrStr(attrs: Record<string, unknown>, key: string): string {
  const v = attrs[key];
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

/**
 * Groq-generated search keywords merged into product.aiTags on create/update.
 * Never throws — returns [] when Groq is off or parsing fails.
 */
export async function generateAiTags(
  name: string,
  category: ProductCategory | string,
  description: string,
  categoryAttributes: Record<string, unknown>
): Promise<string[]> {
  if (!groqConfigured()) return [];
  const attrs = categoryAttributes && typeof categoryAttributes === "object" ? categoryAttributes : {};
  const prompt = `
Product name: ${name}
Category: ${category}
Description: ${description}
Brand: ${attrStr(attrs, "brand") || "not specified"}
Colors: ${attrStr(attrs, "colors") || attrStr(attrs, "color") || "not specified"}
Sizes: ${attrStr(attrs, "sizes") || "not specified"}
Material: ${attrStr(attrs, "material") || "not specified"}
Model: ${attrStr(attrs, "model") || "not specified"}
Condition: ${attrStr(attrs, "condition") || "not specified"}

Generate 8-15 search keywords Ghanaian buyers would use.
Include colors, brand variants, style names, synonyms, related items.
Return ONLY a JSON array. Example: ["green","adidas","sneaker"]
`.trim();

  try {
    const response = await groqCompletion(
      "You are a product tagging assistant for a Ghana marketplace. Return only JSON arrays of lowercase search keywords. No markdown. No explanation.",
      [{ role: "user", content: prompt }]
    );
    if (!response) return [];
    const cleaned = response.replace(/```json|```/g, "").trim();
    const tags = JSON.parse(cleaned) as unknown;
    return Array.isArray(tags)
      ? tags
          .map((t: unknown) => String(t).toLowerCase().trim())
          .filter((t) => t.length > 1 && t.length < 50)
          .slice(0, 15)
      : [];
  } catch {
    return [];
  }
}
