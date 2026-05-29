import type { ProductCategory } from "./product.model";
import { PRODUCT_CATEGORIES } from "./product.model";

export type MarketplaceSubcategoryDef = {
  id: string;
  label: string;
  /** Extra tokens persisted on the listing for full-text search (category remains the parent browse hub). */
  keywords: string[];
};

function labelTokens(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[()/&,]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9_-]/gi, "").trim())
    .filter((w) => w.length >= 3);
}

function def(id: string, label: string, keywords: string[]): MarketplaceSubcategoryDef {
  const fromLabel = labelTokens(label);
  return { id, label, keywords: [...new Set([...keywords.map((x) => x.toLowerCase()), ...fromLabel])] };
}

/** Curated Marketplace sub-navigation — keep ids stable (stored on products). */
export const MARKETPLACE_SUBCATEGORIES: Record<ProductCategory, MarketplaceSubcategoryDef[]> = {
  food_drinks: [
    def("rice_dishes", "Rice dishes (jollof, waakye, fried rice)", [
      "rice",
      "jollof",
      "waakye",
      "fried rice",
      "angwa",
      "fried",
      "coconut rice"
    ]),
    def("soups_stews", "Soups & stews", [
      "soup",
      "stews",
      "light soup",
      "groundnut soup",
      "palm nut soup",
      "kotomire",
      "okro stew",
      "stew pot"
    ]),
    def("swallows", "Swallows", ["banku", "fufu", "kenkey", "eba", "garri", "swallow"]),
    def("grills_proteins", "Grills & proteins", [
      "grill",
      "grilled",
      "tilapia",
      "beef",
      "goat meat",
      "chicken grilled",
      "kebab",
      "shito fish"
    ]),
    def("snacks_small_chops", "Snacks & small chops", [
      "snack",
      "small chops",
      "spring roll",
      "kelewele",
      "samosa",
      "meat pie"
    ]),
    def("drinks_smoothies", "Drinks & smoothies", [
      "drink",
      "juice fresh",
      "smoothie milkshake bottled",
      "sobolo",
      "milo drink"
    ]),
    def("breakfast_food", "Breakfast", ["breakfast", "porridge", "tea bread", "oats", "boiled eggs"]),
    def("desserts_pastries", "Desserts & pastries", ["pastry cakes", "dessert", "biscuits", "brownies", "pies"])
  ],
  fashion_accessories: [
    def("shoes_footwear", "Shoes & footwear", [
      "shoes",
      "shoe",
      "footwear",
      "sneakers",
      "sandals",
      "heels high",
      "boots",
      "trainers",
      "slippers",
      "loafers"
    ]),
    def("dresses_skirts", "Dresses & skirts", ["dresses", "dress", "skirts", "skirts suit", "gowns"]),
    def("tops_shirts", "Tops & shirts", ["shirt blouse top", "tshirt tees jersey polo"]),
    def("pants_trousers", "Pants & trousers", ["pants trousers jeans chinos shorts cargo"]),
    def("bags_purses", "Bags & purses", ["bag handbags purse backpacks tote sling"]),
    def("jewellery_watches", "Jewellery & watches", [
      "jewellery jewelry",
      "watches bracelets",
      "necklaces",
      "gold chain",
      "earrings"
    ]),
    def("traditional_wear", "Traditional wear (kente, ankara)", ["kente ankara boubou dashiki traditional"]),
    def("sportswear", "Sportswear", ["sportswear activewear gym tights tracksuits"]),
    def("accessories_general", "Accessories (belts, caps, scarves)", ["belts scarves caps sunglasses hats wallets ties"])
  ],
  electronics_gadgets: [
    def("phones_tablets", "Phones & tablets", ["phone smartphone android iphone samsung tablet ipad mobile gadgets"]),
    def("laptops_computers", "Laptops & computers", ["laptop notebooks macbook desktops gaming pc"]),
    def("electronics_accessories", "Accessories (chargers, cases, cables)", [
      "chargers adapters cables hdmi usb screen protector casing powerbank"
    ]),
    def("audio", "Audio", ["earbuds earphones headsets speakers microphones sound"]),
    def("cameras_photo", "Cameras & photography", ["camera lenses webcam gopro photo"]),
    def("gaming", "Gaming", ["gaming console joystick ps xbox handheld steam"])
  ],
  beauty_personal_care: [
    def("skincare", "Skincare", ["moisturizer cleanser toner serum sunscreen face cream"]),
    def("haircare", "Haircare", ["hair shampoo conditioners oils braids sprays weaves wig care"]),
    def("makeup", "Makeup", ["foundation concealer powders lipsticks eyeshadow palettes mascara"]),
    def("fragrances", "Fragrances perfumes", ["perfume cologne body mist fragrance oils"]),
    def("nail_care", "Nail care", ["nail polish manicure acrylic gel"]),
    def("mens_grooming", "Men's grooming", ["beard oil shaving razor grooming kits"])
  ],
  groceries_essentials: [
    def("grains_cereals", "Grains & cereals", ["rice maize oats millet gari grains sacks"]),
    def("cooking_oils_condiments", "Cooking oils & condiments", [
      "palm oil vegetable oil chilli paste powdered spices ketchup"
    ]),
    def("canned_packaged", "Canned & packaged foods", ["tin sardines corned beef noodle packs cereals boxes"]),
    def("beverages_grocery", "Beverages", ["water packs malt drinks soda carton juice"]),
    def("cleaning_supplies", "Cleaning supplies", ["detergent bleach dish soap scourers disinfectant"]),
    def("personal_hygiene", "Personal hygiene", ["toilet tissues toothpaste soaps sanitary pads diapers adult wipes"])
  ],
  services: [
    def("tutoring_academic", "Tutoring & academic", ["tutor lessons typing assignments proofreading"]),
    def("hair_beauty_service", "Hair & beauty services", ["barber braids salons makeup lash haircut"]),
    def("photography", "Photography & video services", ["photographer shoots editing videographer"]),
    def("design_creative", "Design & creative", ["logos flyers posters branding ux ui"]),
    def("laundry_cleaning", "Laundry cleaning home", ["laundry ironing drywash cleaning housekeeping"]),
    def("tech_repairs", "Tech repairs", ["phone repair laptop motherboard tech service"]),
    def("delivery_errands", "Delivery errands runner", ["pickup errands courier errands shopping runner"])
  ],
  books_academic: [
    def("textbooks", "Textbooks", ["course textbook syllabus modules"]),
    def("past_questions", "Past questions bundles", ["wassce bece exams questions packs"]),
    def("novels_fiction", "Novels & fiction", ["novel fiction reading bestseller saga stories"]),
    def("notes_study_guides", "Notes & study guides", ["lecture condensed study guides synopsis"]),
    def("stationery_office", "Stationery office supplies", ["rulers pens calculators paper stapler exercise books"])
  ],
  babies_infants: [
    def("baby_clothing", "Clothing", ["rompers onesie baby gowns socks caps"]),
    def("feeding_supplies", "Feeding", ["bottle sterilizers spoons bibs formula"]),
    def("diapers_hygiene", "Diapers & hygiene", ["diapers pampers wipes powders"]),
    def("toys_learning", "Toys & learning", ["toys learning montessori sensory"]),
    def("nursery_furniture", "Nursery & furniture", ["strollers cot crib walkers pram nursery"])
  ]
};

const defsByCat = new Map<ProductCategory, Map<string, MarketplaceSubcategoryDef>>();
for (const cat of PRODUCT_CATEGORIES) {
  const m = new Map<string, MarketplaceSubcategoryDef>();
  for (const d of MARKETPLACE_SUBCATEGORIES[cat]) {
    m.set(d.id, d);
  }
  defsByCat.set(cat, m);
}

export function isValidMarketplaceSubcategory(cat: ProductCategory, id: string | null): boolean {
  if (!id) return true;
  return defsByCat.get(cat)?.has(id) ?? false;
}

/** Returns stored slug or null after trimming / unknown cleanup. */
export function normalizeMarketplaceSubcategory(cat: ProductCategory, raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!isValidMarketplaceSubcategory(cat, s)) return null;
  return s;
}

export function marketplaceSubcategoryLabel(
  cat: ProductCategory,
  subcategoryId: string | null | undefined
): string | null {
  if (!subcategoryId) return null;
  return defsByCat.get(cat)?.get(subcategoryId)?.label ?? null;
}

/**
 * Persisted helper string for Atlas/Mongo `$text` and regex fallback —
 * mixes label tokens + keywords so broad buyer queries (e.g. “shoes”) match fashion footwear.
 */
export function computeListingSearchAssist(cat: ProductCategory, subcategoryId: string | null): string {
  if (!subcategoryId) return "";
  const d = defsByCat.get(cat)?.get(subcategoryId);
  if (!d) return "";
  const slugSpace = subcategoryId.replace(/_/g, " ");
  return [d.label, slugSpace, ...d.keywords].join(" ").toLowerCase().slice(0, 900);
}
