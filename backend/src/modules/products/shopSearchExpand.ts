import type { ProductCategory } from "./product.model";
import { PRODUCT_CATEGORIES } from "./product.model";
import { MARKETPLACE_SUBCATEGORIES } from "./productSubcategories";

/** Map casual shopper language to our catalog category (shared by shop search + assistant). */
export function detectCategoryFromMessage(message: string): ProductCategory | null {
  const m = String(message || "").toLowerCase();
  if (/shoe|heel|boot|sandal|footwear|sneaker|trainer|slipper|canvas\b/.test(m)) return "fashion_accessories";
  if (/food|eat|eating|hungry|menu|dish|dishes|restaurant|cafeteria|waakye|jollof|fufu|snack\b/.test(m)) return "food_drinks";
  if (
    /\belectronic|gadget|laptop|phone|charger|cable|earbud|headphone|tablet|computer|computing|tech\b|technology|it\b|ict\b|iphone|android|samsung|macbook|powerbank|usb\b/.test(
      m
    )
  )
    return "electronics_gadgets";
  if (
    /beauty|makeup|skin|skincare|hair|braid|braids|weave|weaves|wig|wigs|extension|extensions|perfume|cosmetic|lipstick|toothbrush|toothpaste|deodorant|soap|shampoo|conditioner|razor|shaving|floss|mouthwash|sanitary|tampon|pad\b|lotion|cream\b|cologne|\bmask\b|nail|manicure|barber/.test(
      m
    )
  )
    return "beauty_personal_care";
  if (/\bbaby|babies|infant|infants|newborn|nursery|stroller|pram|crib|diaper|nappy|teether|bodysuit|onesie\b/.test(m))
    return "babies_infants";
  if (/\bbook|novel|textbook|course ?book|stationery\b/.test(m)) return "books_academic";
  if (/service|repair|fix|tutor|plumb|electrician|hire|errand|laundry|photograph/.test(m)) return "services";
  if (/grocery|groceries|vegetable|fruit\b|essentials\b|provision/.test(m)) return "groceries_essentials";
  if (
    /fashion|cloth|dress|shirt|pant|skirt|jean|denim|bag|purse|wallet|jewelry|jewellery|jewel|watch|belt|accessor|bracelet|necklace|earring|ankara|kente|outfit/.test(
      m
    )
  )
    return "fashion_accessories";
  return null;
}

export type ShopSearchExpansion = {
  keywords: string[];
  queryTokens: string[];
  categoryHint: ProductCategory | null;
  /** Shopper typed a general aisle term — merge full category when matches are thin */
  isBroadCategory: boolean;
};

const SEARCH_STOP = new Set([
  "the",
  "a",
  "an",
  "for",
  "and",
  "or",
  "to",
  "want",
  "looking",
  "cheap",
  "buy",
  "best",
  "near",
  "some",
  "please",
  "need",
  "get",
  "under",
  "within",
  "with",
  "show",
  "me",
  "find",
  "any",
  "all",
  "am",
  "im"
]);

/** Standalone tokens that mean a whole category (not the English pronoun in a sentence). */
const STANDALONE_CATEGORY_TOKEN: Record<string, ProductCategory> = {
  it: "electronics_gadgets",
  tech: "electronics_gadgets",
  ict: "electronics_gadgets",
  electronics: "electronics_gadgets",
  food: "food_drinks",
  fashion: "fashion_accessories",
  beauty: "beauty_personal_care",
  groceries: "groceries_essentials",
  grocery: "groceries_essentials",
  services: "services",
  service: "services",
  books: "books_academic",
  book: "books_academic",
  baby: "babies_infants",
  babies: "babies_infants"
};

const MANUAL_SYNONYM_GROUPS: Record<string, string[]> = {
  it: ["it", "tech", "technology", "electronics", "computer", "computing", "laptop", "phone", "gadget", "charger", "cable"],
  tech: ["tech", "technology", "electronics", "computer", "laptop", "phone", "gadget", "it"],
  braids: ["braids", "braid", "hair", "weave", "weaves", "wig", "wigs", "extension", "extensions", "haircare"],
  braid: ["braid", "braids", "hair", "weave", "wig", "extensions"],
  shoes: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "heel", "heels", "sandal", "sandals", "boot", "boots", "trainer", "slippers"],
  shoe: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "sandal", "heel"],
  food: ["food", "dish", "dishes", "meal", "menu", "jollof", "waakye", "banku", "fufu", "snack", "drink", "restaurant"],
  dishes: ["dish", "dishes", "meal", "food", "menu", "jollof", "waakye"],
  accessories: [
    "accessories",
    "jewelry",
    "jewellery",
    "bracelet",
    "necklace",
    "earring",
    "ring",
    "watch",
    "bag",
    "belt",
    "wallet"
  ],
  laptop: ["laptop", "laptops", "computer", "notebook", "macbook", "pc"],
  phone: ["phone", "phones", "smartphone", "mobile", "iphone", "android", "samsung", "tecno", "infinix"]
};

function normToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function labelTokens(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[()/&,]/g, " ")
    .split(/\s+/)
    .map((w) => normToken(w))
    .filter((w) => w.length >= 2);
}

type SearchLexicon = {
  synonymByToken: Map<string, Set<string>>;
  categoryByToken: Map<string, ProductCategory>;
  broadByCategory: Record<ProductCategory, Set<string>>;
};

function buildSearchLexicon(): SearchLexicon {
  const synonymByToken = new Map<string, Set<string>>();
  const categoryByToken = new Map<string, ProductCategory>();
  const broadByCategory = Object.fromEntries(
    PRODUCT_CATEGORIES.map((c) => [c, new Set<string>()])
  ) as Record<ProductCategory, Set<string>>;

  const addTerm = (token: string, related: string[], category: ProductCategory) => {
    const key = normToken(token);
    if (key.length < 2) return;
    if (!synonymByToken.has(key)) synonymByToken.set(key, new Set());
    const bucket = synonymByToken.get(key)!;
    bucket.add(key);
    for (const r of related) {
      const t = normToken(r);
      if (t.length >= 2) bucket.add(t);
    }
    categoryByToken.set(key, category);
    broadByCategory[category].add(key);
  };

  for (const cat of PRODUCT_CATEGORIES) {
    const c = cat as ProductCategory;
    for (const def of MARKETPLACE_SUBCATEGORIES[c]) {
      const slugParts = def.id.split("_").map(normToken).filter((p) => p.length >= 2);
      const related = [
        ...slugParts,
        ...def.keywords,
        ...labelTokens(def.label),
        def.id.replace(/_/g, " ")
      ];
      const uniqueRelated = [...new Set(related.map(normToken).filter((t) => t.length >= 2))];
      for (const term of uniqueRelated) {
        addTerm(term, uniqueRelated, c);
      }
    }
  }

  for (const [token, group] of Object.entries(MANUAL_SYNONYM_GROUPS)) {
    const hint =
      STANDALONE_CATEGORY_TOKEN[token] ||
      categoryByToken.get(normToken(token)) ||
      detectCategoryFromMessage(token) ||
      detectCategoryFromMessage(group.join(" "));
    if (!hint) continue;
    addTerm(token, group, hint);
  }

  for (const [token, cat] of Object.entries(STANDALONE_CATEGORY_TOKEN)) {
    addTerm(token, [token], cat);
  }

  return { synonymByToken, categoryByToken, broadByCategory };
}

const LEXICON = buildSearchLexicon();

function tokenizeQuery(q: string): string[] {
  const t = q.trim().toLowerCase().replace(/\s+/g, " ");
  const parts = t
    .split(/\s+/)
    .map((w) => normToken(w))
    .filter((w) => w.length >= 2 && !SEARCH_STOP.has(w));
  if (parts.length) return parts;
  const single = normToken(t);
  return single.length >= 2 ? [single] : [];
}

/** Simple plural/singular variants so "earring" also matches "earrings". */
function stemVariants(token: string): string[] {
  const t = normToken(token);
  if (t.length < 3) return [t];
  const out = new Set<string>([t]);
  if (t.endsWith("ies") && t.length > 4) out.add(`${t.slice(0, -3)}y`);
  if (t.endsWith("es") && t.length > 4) out.add(t.slice(0, -2));
  if (t.endsWith("s") && !t.endsWith("ss") && t.length > 3) out.add(t.slice(0, -1));
  if (!t.endsWith("s")) out.add(`${t}s`);
  return [...out].filter((x) => x.length >= 2);
}

function addSynonymsFromLexicon(out: Set<string>, token: string) {
  const key = normToken(token);
  if (!key) return;
  for (const stem of stemVariants(key)) out.add(stem);
  const fromLex = LEXICON.synonymByToken.get(key);
  if (fromLex) {
    for (const s of fromLex) out.add(s);
  }
  const manual = MANUAL_SYNONYM_GROUPS[key];
  if (manual) {
    for (const s of manual) out.add(normToken(s));
  }
}

function resolveCategoryHint(q: string, queryTokens: string[]): ProductCategory | null {
  const fromMessage = detectCategoryFromMessage(q);
  if (fromMessage) return fromMessage;

  if (queryTokens.length === 1) {
    const t = queryTokens[0]!;
    if (STANDALONE_CATEGORY_TOKEN[t]) return STANDALONE_CATEGORY_TOKEN[t];
    if (LEXICON.categoryByToken.has(t)) return LEXICON.categoryByToken.get(t)!;
  }

  if (queryTokens.length > 0 && queryTokens.length <= 3) {
    const cats = queryTokens.map((t) => LEXICON.categoryByToken.get(t)).filter(Boolean) as ProductCategory[];
    if (cats.length === queryTokens.length) {
      const first = cats[0];
      if (cats.every((c) => c === first)) return first;
    }
  }

  return null;
}

/** True when we should top up results from the whole category (aisle-style query). */
function computeIsBroadCategory(categoryHint: ProductCategory | null, queryTokens: string[]): boolean {
  if (!categoryHint || !queryTokens.length) return false;
  const broad = LEXICON.broadByCategory[categoryHint];
  if (!broad) return false;
  if (queryTokens.length > 3) return false;
  return queryTokens.every((t) => broad.has(t));
}

/** Expand shopper query with catalog-wide synonyms and detect category intent. */
export function expandShopSearchQuery(rawQ: string): ShopSearchExpansion {
  const q = rawQ.trim().toLowerCase().replace(/\s+/g, " ");
  const queryTokens = tokenizeQuery(q);
  const keywords = new Set<string>();

  for (const tok of queryTokens) addSynonymsFromLexicon(keywords, tok);
  /** Always search the shopper's exact words even when not in the subcategory lexicon. */
  for (const tok of queryTokens) {
    keywords.add(tok);
    for (const stem of stemVariants(tok)) keywords.add(stem);
  }

  const wholeKey = q.replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, " ");
  if (MANUAL_SYNONYM_GROUPS[wholeKey]) {
    for (const s of MANUAL_SYNONYM_GROUPS[wholeKey]) keywords.add(normToken(s));
  }
  const wholeCompact = normToken(wholeKey.replace(/\s+/g, ""));
  if (wholeCompact.length >= 2) addSynonymsFromLexicon(keywords, wholeCompact);

  if (!keywords.size && q.length >= 2) {
    addSynonymsFromLexicon(keywords, normToken(q));
  }

  const categoryHint = resolveCategoryHint(q, queryTokens);
  const isBroadCategory = computeIsBroadCategory(categoryHint, queryTokens);

  return {
    keywords: [...keywords].filter(Boolean).slice(0, 20),
    queryTokens,
    categoryHint,
    isBroadCategory
  };
}

/** Merge category browse when text search under-delivers (shop + assistant). */
export function shouldSupplementCategoryBrowse(
  expansion: ShopSearchExpansion,
  resultCount: number,
  maxQueryTokens = 3
): boolean {
  if (!expansion.categoryHint) return false;
  if (expansion.isBroadCategory) return true;
  if (expansion.queryTokens.length > maxQueryTokens) return false;
  return resultCount < 20;
}
