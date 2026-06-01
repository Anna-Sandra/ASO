import { PRODUCT_CATEGORY_VALUES, CATEGORY_LABELS } from "config/catalog";

const COMMON_CONDITION = [
  { value: "", label: "Select condition" },
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good / used" },
  { value: "fair", label: "Fair" },
  { value: "parts", label: "For parts" }
];

const FASHION_STYLE_OPTIONS = [
  { value: "", label: "Select style" },
  { value: "sneaker", label: "Sneaker / trainer" },
  { value: "heel", label: "Heel" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "sport", label: "Sport / gym" },
  { value: "sandals", label: "Sandals" },
  { value: "boots", label: "Boots" },
  { value: "accessory", label: "Accessory (bag, belt, etc.)" }
];

/** Categories that show the “fill brand, color, size” tip on the vendor form. */
export const LISTING_ATTR_TIP_CATEGORIES = new Set([
  "fashion_accessories",
  "electronics_gadgets",
  "beauty_personal_care",
  "babies_infants"
]);

/** @typedef {{ key: string, label: string, type?: string, placeholder?: string, optional?: boolean, rows?: number, options?: { value: string, label: string }[], step?: string }} ListingAttrField */

/** Category-specific attribute rows (validated on the API). Books `pdfUrl` is handled in vendor UI via upload + optional URL field. */
const ATTR_FIELDS = {
  food_drinks: [
    { key: "ingredients", label: "Ingredients *", type: "textarea", rows: 3, placeholder: "Main ingredients or allergens buyers should know" },
    { key: "portionSize", label: "Portion size *", placeholder: "e.g. Regular, Large, Family size" },
    { key: "availability", label: "Availability *", placeholder: "e.g. Mon–Fri 8am–6pm" },
    {
      key: "deliveryOption",
      label: "Delivery option *",
      type: "select",
      options: [
        { value: "", label: "Choose an option" },
        { value: "pickup", label: "Pickup only" },
        { value: "campus_delivery", label: "Local delivery / courier" },
        { value: "both", label: "Pickup and delivery" }
      ]
    },
    { key: "preparationTimeMinutes", label: "Preparation time (minutes)", type: "number", optional: true, placeholder: "e.g. 30" }
  ],
  fashion_accessories: [
    {
      key: "brand",
      label: "Brand *",
      placeholder: "e.g. Adidas, Nike, Aldo, local brand — write 'No brand' if unbranded"
    },
    { key: "colors", label: "Colors *", placeholder: "e.g. Green, Black, Red (separate with commas)" },
    { key: "sizes", label: "Sizes offered *", placeholder: "e.g. S, M, L or 36, 37, 38, 39, 40, 42" },
    {
      key: "gender",
      label: "Gender / fit *",
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
    { key: "condition", label: "Condition *", type: "select", options: COMMON_CONDITION },
    {
      key: "style",
      label: "Style",
      type: "select",
      optional: true,
      options: FASHION_STYLE_OPTIONS
    },
    { key: "material", label: "Material", optional: true, placeholder: "e.g. Canvas, Leather, Cotton" }
  ],
  electronics_gadgets: [
    { key: "brand", label: "Brand *", placeholder: "e.g. Samsung, Apple, Tecno, Infinix" },
    { key: "model", label: "Model *", placeholder: "e.g. Galaxy A54, iPhone 13" },
    { key: "condition", label: "Condition *", type: "select", options: COMMON_CONDITION },
    { key: "color", label: "Color", optional: true, placeholder: "e.g. Black, White, Gold" },
    { key: "storage", label: "Storage", optional: true, placeholder: "e.g. 128GB, 256GB" },
    { key: "warranty", label: "Warranty", optional: true, placeholder: "e.g. 90-day seller · none" },
    {
      key: "specifications",
      label: "Specifications / notes",
      type: "textarea",
      optional: true,
      rows: 4,
      placeholder: "Storage, connectivity, inbox contents…"
    }
  ],
  beauty_personal_care: [
    { key: "brand", label: "Brand *", placeholder: "e.g. Nivea, ORS, Cantu, local brand" },
    {
      key: "skinHairType",
      label: "Skin / hair type *",
      placeholder: "e.g. Sensitive skin · 4c hair · unscented preference"
    },
    { key: "expiryDate", label: "Expiry / best before", optional: true, placeholder: "e.g. 2027-06" }
  ],
  babies_infants: [
    {
      key: "ageRangeOrStage",
      label: "Age range / stage *",
      placeholder: "e.g. Newborn · 0–6 months · 12–24 months · maternity"
    },
    {
      key: "sizingOrDimensions",
      label: "Sizing / dimensions",
      optional: true,
      placeholder: "e.g. 3–6 kg diapers · Onesie 3M"
    },
    {
      key: "compositionOrMaterials",
      label: "Materials / composition",
      type: "textarea",
      optional: true,
      rows: 3,
      placeholder: "e.g. 100% organic cotton · BPA-free silicone"
    },
    {
      key: "safetyOrComplianceNotes",
      label: "Safety / certifications (optional)",
      type: "textarea",
      optional: true,
      rows: 2,
      placeholder: "e.g. CE-marked toy — link docs in description if needed"
    }
  ],
  books_academic: [
    { key: "author", label: "Author", placeholder: "Author or editor name" },
    { key: "courseCode", label: "Course code / module", placeholder: "e.g. STAT201" },
    { key: "condition", label: "Condition", type: "select", options: COMMON_CONDITION }
  ],
  groceries_essentials: [
    { key: "packQuantity", label: "Quantity in pack / count", placeholder: "e.g. 6 rolls · 500g" },
    { key: "unit", label: "Unit", placeholder: "e.g. kg, pack, piece, carton" },
    { key: "expiryDate", label: "Expiry / best before", placeholder: "e.g. 2026-01" }
  ],
  services: [
    {
      key: "serviceExamples",
      label: "Type of service",
      placeholder: "e.g. Logo design · Edge-ups · Assignment typing"
    },
    {
      key: "whatsIncluded",
      label: "What's included",
      type: "textarea",
      rows: 4,
      placeholder: "Deliverables, revisions, turnaround expectations…"
    },
    { key: "estimatedTurnaround", label: "Typical turnaround", placeholder: "e.g. Within 48h" },
    {
      key: "serviceArea",
      label: "Service area",
      placeholder: "e.g. Accra · WhatsApp-first"
    },
    {
      key: "clientShouldProvide",
      label: "Buyer should prepare / send",
      type: "textarea",
      optional: true,
      rows: 3,
      placeholder: "Files, measurements, deadlines…"
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
  hidePrice: false,
  stockLabel: "Availability",
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
    hidePrice: false,
    showStock: true,
    namePlaceholder: "e.g. Jollof lunch box, iced cocoa 500ml",
    photosLabel: "Food images",
    photosHintTail: " Clear shots help buyers decide quickly.",
    showAddons: true,
    addonsLabel: "Customization options (proteins, extras, sides)",
    addonsHint: "Buyers can add or remove items. Set label and extra cost."
  },
  fashion_accessories: {
    ...DEFAULT_META,
    formPanelTitle: "Fashion listing",
    nameLabel: "Item name",
    namePlaceholder: "e.g. Green Adidas canvas sneakers size 42",
    photosLabel: "Images",
    attrTip:
      "Buyers search by brand, color and size. Filling these in helps more people find your product — even if the title is short."
  },
  electronics_gadgets: {
    ...DEFAULT_META,
    formPanelTitle: "Electronics listing",
    namePlaceholder: "e.g. Samsung Galaxy A54 128GB",
    photosLabel: "Images",
    attrTip: "Buyers search by brand and model. Add accurate details so your listing appears in assistant and search results."
  },
  beauty_personal_care: {
    ...DEFAULT_META,
    formPanelTitle: "Beauty & care listing",
    namePlaceholder: "e.g. Moisturiser 120ml · Castor oil braid spray",
    photosLabel: "Images",
    attrTip: "Brand and skin/hair type help shoppers find the right product in search and the shopping assistant."
  },
  babies_infants: {
    ...DEFAULT_META,
    formPanelTitle: "Baby & infant listing",
    pageHeading: "Add baby / infant product",
    namePlaceholder: "e.g. Muslin swaddle set · Gentle baby wash",
    descPlaceholder:
      "Care essentials, sizing, washes, allergens, expiry if applicable — parents read every detail.",
    photosLabel: "Product photos",
    photosHintTail: " Clear, well-lit photos build trust with parents.",
    draftHelp: "Listings require honest age guidance and material notes when relevant.",
    attrTip: "Age range / stage helps parents and search find your item."
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
    namePlaceholder: "e.g. Indomie carton · Sanitiser refill 500ml",
    photosLabel: "Images"
  },
  services: {
    ...DEFAULT_META,
    isService: true,
    hidePrice: false,
    showStock: true,
    pageHeading: "Add service listing",
    formPanelTitle: "Your service — not a physical product listing",
    nameLabel: "Service name",
    namePlaceholder: "e.g. Event photography · Weekday tutoring",
    descLabel: "Overview for buyers",
    descPlaceholder:
      "Describe outcomes, typical process, boundaries, how booking works — buyers often message before paying.",
    showTags: false,
    photosLabel: "Portfolio / proof images",
    photosHintTail: " Show past work builds trust.",
    publishTitle: "Publish service",
    publishBlurb:
      "Adds your service for admin review. Buyers often confirm details in Messages before or after booking.",
    draftHelp:
      "Services still go through moderation. Buyers often continue in Messages — reply promptly after approval.",
    showAddons: true,
    addonsLabel: "Service add-ons (optional extras buyers can select)",
    addonsHint: "e.g. Express delivery +GHS 10, Extra revision +GHS 20"
  }
};

export function getListingMeta(category) {
  return { ...DEFAULT_META, ...(LISTING_FORM_META[category] || {}) };
}

export function listingEditPageHeading(category) {
  const m = getListingMeta(category);
  return m.isService ? "Edit service listing" : "Edit product";
}

function attrFilled(attrs, key) {
  const v = attrs?.[key];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Client-side publish validation — mirrors backend validateRequiredCategoryAttributesForPublish.
 * @param {string} category
 * @param {Record<string, string>} attrs
 * @param {{ publishing?: boolean }} [opts]
 * @returns {string | null}
 */
export function validateCategoryAttributesForPublish(category, attrs, opts = {}) {
  if (!opts.publishing) return null;
  switch (category) {
    case "fashion_accessories":
      if (!attrFilled(attrs, "brand")) {
        return "Please enter the brand name. Write 'No brand' if unbranded.";
      }
      if (!attrFilled(attrs, "colors")) return "Please enter the color(s) of this item.";
      if (!attrFilled(attrs, "sizes")) return "Please enter sizes offered (e.g. 40, 41, 42 or S, M, L).";
      if (!attrFilled(attrs, "gender")) return "Please select gender / fit.";
      if (!attrFilled(attrs, "condition")) return "Please select condition.";
      break;
    case "electronics_gadgets":
      if (!attrFilled(attrs, "brand")) return "Please enter the brand (e.g. Samsung, Apple, Tecno).";
      if (!attrFilled(attrs, "model")) return "Please enter the model name or number.";
      if (!attrFilled(attrs, "condition")) return "Please select condition.";
      break;
    case "beauty_personal_care":
      if (!attrFilled(attrs, "brand")) return "Please enter the brand name.";
      if (!attrFilled(attrs, "skinHairType")) return "Please describe skin / hair type this product suits.";
      break;
    case "babies_infants":
      if (!attrFilled(attrs, "ageRangeOrStage")) return "Please enter age range / stage (e.g. Newborn, 0–6 months).";
      break;
    case "food_drinks":
      if (!attrFilled(attrs, "ingredients")) return "Please list main ingredients buyers should know.";
      if (!attrFilled(attrs, "portionSize")) return "Please enter portion size.";
      if (!attrFilled(attrs, "availability")) return "Please enter availability (days/hours).";
      if (!attrFilled(attrs, "deliveryOption")) return "Please choose a delivery option.";
      break;
    default:
      break;
  }
  return null;
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
  const meta = getListingMeta(category);
  const nodes = [];

  if (meta.attrTip && LISTING_ATTR_TIP_CATEGORIES.has(category)) {
    nodes.push(
      h(
        "p",
        {
          key: "attr-tip",
          className:
            "mb-3 rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100"
        },
        `Tip: ${meta.attrTip}`
      )
    );
  }

  /** @param {string} key @param {import("react").ChangeEvent<{ value: string }>} e */
  const ch =
    (key) =>
    (e) =>
      setAttrs((prev) => ({ ...prev, [key]: e.target.value }));

  for (const f of fields) {
    const lbl = `${f.label}${f.optional ? " (optional)" : ""}`;
    if (f.type === "textarea") {
      nodes.push(
        h(
          Field,
          { key: f.key, label: lbl },
          h(TextArea, {
            value: attrs[f.key] ?? "",
            onChange: ch(f.key),
            placeholder: f.placeholder || "",
            rows: f.rows || 4
          })
        )
      );
      continue;
    }
    if (f.type === "select" && f.options?.length) {
      nodes.push(
        h(
          Field,
          { key: f.key, label: f.label },
          h(SelectInput, { value: attrs[f.key] ?? "", onChange: ch(f.key) }, [
            ...f.options.map((o, i) => h("option", { key: `${f.key}-opt-${i}`, value: o.value }, o.label))
          ])
        )
      );
      continue;
    }
    nodes.push(
      h(
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
      )
    );
  }

  return nodes;
}

/** Category labels for picker (must match PRODUCT_CATEGORY_VALUES). */
export function categorySelectRows() {
  return PRODUCT_CATEGORY_VALUES.map((id) => ({ id, label: CATEGORY_LABELS[id] || id }));
}
