import { PRODUCT_CATEGORY_VALUES, CATEGORY_LABELS } from "./catalog";

const COMMON_CONDITION = [
  { value: "", label: "Select condition" },
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good / used" },
  { value: "fair", label: "Fair" },
  { value: "parts", label: "For parts" }
];

/** @typedef {{ key: string, label: string, type?: string, placeholder?: string, optional?: boolean, rows?: number, options?: { value: string, label: string }[], step?: string }} ListingAttrField */

/** Category-specific attribute rows (validated on the API). Books `pdfUrl` is handled in vendor UI via upload + optional URL field. */
const ATTR_FIELDS = {
  food_drinks: [
    { key: "preparationTimeMinutes", label: "Preparation time (minutes)", type: "number", placeholder: "e.g. 30" },
    { key: "availability", label: "Availability", placeholder: "e.g. weekdays 11am–8pm · weekends noon–6pm" },
    {
      key: "deliveryOption",
      label: "Delivery option",
      type: "select",
      options: [
        { value: "", label: "Choose an option" },
        { value: "pickup", label: "Pickup only" },
        { value: "campus_delivery", label: "Campus delivery / courier" },
        { value: "both", label: "Pickup and delivery" }
      ]
    },
    { key: "ingredients", label: "Ingredients", type: "textarea", optional: true, rows: 4, placeholder: "Main ingredients or allergens…" },
    { key: "portionSize", label: "Portion size", optional: true, placeholder: "e.g. Regular · Large platter" }
  ],
  fashion_accessories: [
    { key: "sizes", label: "Sizes offered", placeholder: "e.g. S, M, L, XL or numeric" },
    { key: "colors", label: "Colors", placeholder: "e.g. Black, Olive, Cream" },
    {
      key: "gender",
      label: "Gender / fit",
      type: "select",
      options: [
        { value: "", label: "Select" },
        { value: "women", label: "Women" },
        { value: "men", label: "Men" },
        { value: "unisex", label: "Unisex" },
        { value: "kids", label: "Kids" },
        { value: "any", label: "Any / not specified" }
      ]
    },
    { key: "condition", label: "Condition", type: "select", options: COMMON_CONDITION },
    { key: "brand", label: "Brand", optional: true, placeholder: "Optional" },
    { key: "material", label: "Material", optional: true, placeholder: "Optional" }
  ],
  electronics_gadgets: [
    { key: "brand", label: "Brand", placeholder: "e.g. Samsung" },
    { key: "model", label: "Model", placeholder: "e.g. SM-A525" },
    { key: "condition", label: "Condition", type: "select", options: COMMON_CONDITION },
    { key: "warranty", label: "Warranty", placeholder: "e.g. 90-day seller · none" },
    { key: "specifications", label: "Specifications / notes", type: "textarea", optional: true, rows: 5, placeholder: "Storage, connectivity, inbox contents…" }
  ],
  beauty_personal_care: [
    {
      key: "skinHairType",
      label: "Skin / hair type",
      placeholder: "e.g. Sensitive skin · 4c hair · unscented preference"
    },
    { key: "expiryDate", label: "Expiry / best before", placeholder: "e.g. 2027-06 or Approx. 12 months sealed" }
  ],
  books_academic: [
    { key: "author", label: "Author", placeholder: "Author or editor name" },
    { key: "courseCode", label: "Course code / module", placeholder: "e.g. STAT201" },
    { key: "condition", label: "Condition", type: "select", options: COMMON_CONDITION }
  ],
  groceries_essentials: [
    { key: "packQuantity", label: "Quantity in pack / count", placeholder: "e.g. 6 rolls · 500g · 24 bottles" },
    { key: "unit", label: "Unit", placeholder: "e.g. kg, pack, piece, carton" },
    { key: "expiryDate", label: "Expiry / best before", placeholder: "e.g. 2026-01" }
  ],
  services: [
    {
      key: "serviceExamples",
      label: "Type of service",
      placeholder: "e.g. Logo design · Edge-ups · Assignment typing · Laundry pickup"
    },
    {
      key: "whatsIncluded",
      label: "What's included",
      type: "textarea",
      rows: 4,
      placeholder: "Deliverables, revisions, turnaround expectations…"
    },
    { key: "estimatedTurnaround", label: "Typical turnaround", placeholder: "e.g. Within 48h · Same day booking" },
    {
      key: "serviceArea",
      label: "Service area",
      placeholder: "e.g. North campus · WhatsApp-first · Buyer meets on campus only"
    },
    {
      key: "clientShouldProvide",
      label: "Buyer should prepare / send",
      type: "textarea",
      optional: true,
      rows: 3,
      placeholder: "Files, measurements, deadlines, preferences…"
    }
  ]
};

const DEFAULT_META = {
  isService: false,
  pageHeading: "Add new product",
  formPanelTitle: "Product details",
  nameLabel: "Product name",
  namePlaceholder: "e.g. Scientific calculator, rice bowl meal kit",
  descLabel: "Description",
  descPlaceholder: "Tell buyers what makes this special…",
  showStock: true,
  showTags: true,
  /** When true, vendor UI omits listing price — stored as GHS 0 on the API. */
  hidePrice: false,
  stockLabel: "Stock quantity",
  photosLabel: "Product photos",
  photosHintTail: "",
  publishTitle: "Publish",
  publishBlurb:
    "Submits your listing for admin review. It only appears in the shop after approval (usually quick).",
  draftHelp: ""
};

/** @type {Record<string, typeof DEFAULT_META>} */
export const LISTING_FORM_META = {
  food_drinks: {
    ...DEFAULT_META,
    formPanelTitle: "Food & drink listing",
    /** Menu-style: buyers contact / call to order; storefront hides list price (stored as 0). */
    hidePrice: true,
    showStock: false,
    namePlaceholder: "e.g. Jollof lunch box, iced cocoa 500ml",
    photosLabel: "Food images",
    photosHintTail: " Clear shots help buyers decide quickly."
  },
  fashion_accessories: {
    ...DEFAULT_META,
    formPanelTitle: "Fashion listing",
    nameLabel: "Item name",
    namePlaceholder: "e.g. Denim tote · Canvas sneakers · Gold studs",
    photosLabel: "Images"
  },
  electronics_gadgets: {
    ...DEFAULT_META,
    formPanelTitle: "Electronics listing",
    namePlaceholder: "e.g. Power bank 20Ah · Wired earphones USB-C",
    photosLabel: "Images"
  },
  beauty_personal_care: {
    ...DEFAULT_META,
    formPanelTitle: "Beauty & care listing",
    namePlaceholder: "e.g. Moisturiser 120ml · Castor oil braid spray",
    photosLabel: "Images"
  },
  books_academic: {
    ...DEFAULT_META,
    formPanelTitle: "Book / academic listing",
    nameLabel: "Book title",
    namePlaceholder: "e.g. Calculus Lecture Notes Pack",
    photosLabel: "Cover / plate images",
    photosHintTail: " Add PDF below if selling a digital companion."
  },
  groceries_essentials: {
    ...DEFAULT_META,
    formPanelTitle: "Groceries listing",
    stockLabel: "How many units / packs in stock",
    namePlaceholder: "e.g. Indomie carton · Sanitiser refill 500ml",
    photosLabel: "Images"
  },
  services: {
    isService: true,
    hidePrice: true,
    pageHeading: "Add service listing",
    formPanelTitle: "Your service — not a physical product listing",
    nameLabel: "Service name",
    namePlaceholder: "e.g. Event photography · Weekday tutoring · Laundry bundle",
    descLabel: "Overview for buyers",
    descPlaceholder:
      "Describe outcomes, typical process, boundaries, how booking works — buyers often message before paying.",
    showStock: false,
    showTags: false,
    stockLabel: "Capacity (optional)",
    photosLabel: "Portfolio / proof images",
    photosHintTail: " Show past work builds trust.",
    publishTitle: "Publish service",
    publishBlurb:
      "Adds your service for admin review. Buyers often confirm details in Messages before or after booking.",
    draftHelp:
      "Services still go through moderation. Buyers often continue in Messages — reply promptly after approval."
  }
};

export function getListingMeta(category) {
  return { ...DEFAULT_META, ...(LISTING_FORM_META[category] || {}) };
}

export function listingEditPageHeading(category) {
  const m = getListingMeta(category);
  return m.isService ? "Edit service listing" : "Edit product";
}

/** @returns {Record<string, string>} */
export function emptyAttrsForCategory(category) {
  const fields = ATTR_FIELDS[category];
  /** @type {Record<string, string>} */
  const o = {};
  if (!fields) return o;
  for (const f of fields) o[f.key] = "";
  if (category === "books_academic") o.pdfUrl = "";
  return o;
}

/** @returns {Record<string, string>} */
export function mergeAttrsFromServer(category, saved) {
  const base = emptyAttrsForCategory(category);
  const s = saved && typeof saved === "object" ? saved : {};
  for (const k of Object.keys(base)) {
    if (Object.prototype.hasOwnProperty.call(s, k) && s[k] != null) {
      base[k] =
        typeof s[k] === "number"
          ? String(s[k])
          : typeof s[k] === "string"
            ? s[k]
            : String(s[k]);
    }
  }
  return base;
}

/**
 * Backend categoryAttributes payload (validated server-side).
 * @param {string} category
 * @param {Record<string, string>} attrs
 */
export function buildCategoryAttributesPayload(category, attrs) {
  const fields = ATTR_FIELDS[category] || [];
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const f of fields) {
    let raw = attrs[f.key];
    if (raw === undefined || raw === null) continue;
    const str = typeof raw === "string" ? raw.trim() : String(raw).trim();
    if (str === "") continue;
    if (f.key === "preparationTimeMinutes") {
      const n = Number(str);
      if (Number.isFinite(n) && n >= 0) out[f.key] = Math.round(Math.min(n, 10080));
      continue;
    }
    out[f.key] = str;
  }
  if (category === "books_academic" && attrs.pdfUrl != null) {
    const s = String(attrs.pdfUrl).trim();
    if (s) out.pdfUrl = s;
  }
  return out;
}

/**
 * @param {typeof import("./h.js").h} h
 */
export function renderListingCategoryFields(h, { Field, TextInput, TextArea, SelectInput, category, attrs, setAttrs }) {
  const fields = ATTR_FIELDS[category];
  if (!fields?.length) return [];
  /** @param {string} key @param {import("react").ChangeEvent<{ value: string }>} e */
  const ch =
    (key) =>
    (e) =>
      setAttrs((prev) => ({ ...prev, [key]: e.target.value }));

  return fields.map((f) => {
    const lbl = `${f.label}${f.optional ? " (optional)" : ""}`;
    if (f.type === "textarea") {
      return h(
        Field,
        { key: f.key, label: lbl },
        h(TextArea, {
          value: attrs[f.key] ?? "",
          onChange: ch(f.key),
          placeholder: f.placeholder || "",
          rows: f.rows || 4
        })
      );
    }
    if (f.type === "select" && f.options?.length) {
      return h(
        Field,
        { key: f.key, label: f.label },
        h(SelectInput, { value: attrs[f.key] ?? "", onChange: ch(f.key) }, [
          ...f.options.map((o, i) => h("option", { key: `${f.key}-opt-${i}`, value: o.value }, o.label))
        ])
      );
    }
    return h(
      Field,
      { key: f.key, label: lbl },
      h(TextInput, {
        type: f.type === "number" ? "number" : "text",
        step: f.step,
        min: f.type === "number" ? "0" : undefined,
        value: attrs[f.key] ?? "",
        onChange: ch(f.key),
        placeholder: f.placeholder || ""
      })
    );
  });
}

/** Category labels for picker (must match PRODUCT_CATEGORY_VALUES). */
export function categorySelectRows() {
  return PRODUCT_CATEGORY_VALUES.map((id) => ({ id, label: CATEGORY_LABELS[id] || id }));
}
