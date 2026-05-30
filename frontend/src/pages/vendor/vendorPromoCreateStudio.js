import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ImagePlus,
  Lightbulb,
  Send,
  Shield,
  Star,
  Tag
} from "lucide-react";
import { useAuth, useNotice } from "context";
import { apiFetch, apiUploadProductImages } from "services/api";
import { h } from "utils/h";
import { Button, Field, InlineNotice, TextArea, TextInput } from "components/ui";
import { formatGhc } from "utils/money";
import { SITE_NAME } from "config/brand";

const DRAFT_KEY = "shopiqgh-vendor-promo-draft";
const DESC_MAX = 300;
const TERMS_MAX = 300;

const DEAL_KINDS = [
  { id: "flash_sale", label: "Flash sale", hint: "Countdown timer · urgency on shop & deals page" },
  { id: "deal_discount", label: "Discount", hint: "Evergreen or dated price drop on a listing" },
  { id: "deal_bundle", label: "Bundle", hint: "Describe buy-X-get-Y in your description" }
];

function pctOff(compareAt, sale) {
  const c = Number(compareAt);
  const s = Number(sale);
  if (!(c > 0) || !(s >= 0) || !(s < c)) return null;
  return Math.round(((c - s) / c) * 100);
}

function fmtPreviewDate(iso) {
  if (!iso) return "Set end date";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Set end date";
  }
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function PromoPhonePreview({ form, storeLabel, product, offerLabel }) {
  const img =
    form.imageUrl ||
    product?.imageUrls?.[0] ||
    product?.imageUrl ||
    "";
  const sale = form.salePrice.trim() !== "" ? Number(form.salePrice) : Number(product?.price) || 0;
  const cmp = form.compareAt.trim() !== "" ? Number(form.compareAt) : sale;

  return h(
    "div",
    {
      className:
        "mx-auto w-[220px] rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 p-2 shadow-2xl shadow-slate-900/25 dark:border-slate-700 sm:w-[240px]"
    },
    [
      h("div", { className: "overflow-hidden rounded-[1.4rem] bg-[#faf8f5] dark:bg-night-950" }, [
        h("div", { className: "flex items-center justify-center gap-1 bg-slate-900/95 py-1.5" }, [
          h("span", { className: "h-1 w-8 rounded-full bg-slate-600", "aria-hidden": true })
        ]),
        h("div", { className: "p-3" }, [
          h(
            "div",
            {
              className:
                "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md dark:border-white/10 dark:bg-night-900"
            },
            [
              h("div", { className: "relative aspect-[4/3] bg-gradient-to-br from-violet-100 to-sky-100 dark:from-violet-950/40 dark:to-sky-950/30" }, [
                img
                  ? h("img", { src: img, alt: "", className: "h-full w-full object-cover" })
                  : h(
                      "div",
                      { className: "flex h-full items-center justify-center text-slate-400" },
                      h(ImagePlus, { className: "h-8 w-8 opacity-40" })
                    ),
                h(
                  "span",
                  {
                    className:
                      "absolute left-2 top-2 rounded-full bg-violet-700 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-white shadow"
                  },
                  form.tagBadge?.trim() || "Featured promo"
                )
              ]),
              h("div", { className: "space-y-1.5 p-3" }, [
                h(
                  "p",
                  { className: "line-clamp-2 font-display text-[13px] font-bold leading-snug text-slate-900 dark:text-white" },
                  form.title.trim() || "Your promo title"
                ),
                h(
                  "p",
                  { className: "text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300" },
                  storeLabel || "Your store"
                ),
                h(
                  "p",
                  { className: "line-clamp-3 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400" },
                  form.description.trim() || "Describe what buyers get — highlights, freebies, or bundle details."
                ),
                h("div", { className: "mt-2 rounded-xl bg-violet-50 px-2.5 py-2 dark:bg-violet-950/35" }, [
                  h("p", { className: "text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300" }, "Offer"),
                  h(
                    "p",
                    { className: "font-display text-sm font-black text-violet-900 dark:text-violet-100" },
                    offerLabel || "10% OFF"
                  ),
                  h("p", { className: "mt-0.5 text-[9px] text-slate-500 dark:text-slate-400" }, `Valid until ${fmtPreviewDate(form.endsAt)}`)
                ])
              ])
            ]
          ),
          h("div", { className: "mt-3 flex justify-center gap-1" }, [
            h("span", { className: "h-1.5 w-4 rounded-full bg-violet-600" }),
            h("span", { className: "h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" }),
            h("span", { className: "h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" })
          ])
        ])
      ])
    ]
  );
}

export function VendorPromoCreateStudio({ products, inventoryErr, onCancel, onSuccess }) {
  const { accessToken, user } = useAuth();
  const { toast } = useNotice();
  const fileRef = useRef(null);

  const [storeLabel, setStoreLabel] = useState("");
  const [creationKind, setCreationKind] = useState("flash_sale");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [offerText, setOfferText] = useState("");
  const [productId, setProductId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [noEndDiscount, setNoEndDiscount] = useState(false);
  const [tagBadge, setTagBadge] = useState("FEATURED");
  const [compareAt, setCompareAt] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [soldPercent, setSoldPercent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/businesses/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        const list = Array.isArray(d.businesses) ? d.businesses : [];
        const active = list.find((b) => b.status === "active") || list[0];
        const name = String(active?.name || user?.displayName || "Your store").trim();
        setStoreLabel(name);
      })
      .catch(() => setStoreLabel(String(user?.displayName || "Your store")));
  }, [accessToken, user?.displayName]);

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setCreationKind(draft.creationKind || "flash_sale");
    setTitle(draft.title || "");
    setDescription(draft.description || "");
    setTerms(draft.terms || "");
    setOfferText(draft.offerText || "");
    setProductId(draft.productId || "");
    setStartsAt(draft.startsAt || "");
    setEndsAt(draft.endsAt || "");
    setNoEndDiscount(Boolean(draft.noEndDiscount));
    setTagBadge(draft.tagBadge || "FEATURED");
    setCompareAt(draft.compareAt || "");
    setSalePrice(draft.salePrice || "");
    setSoldPercent(draft.soldPercent || "");
    setImageUrl(draft.imageUrl || "");
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(productId)),
    [products, productId]
  );

  useEffect(() => {
    if (!selectedProduct) return;
    if (!compareAt.trim()) setCompareAt(String(selectedProduct.price ?? ""));
    if (!title.trim()) {
      const base = String(selectedProduct.name || "").trim().slice(0, 80);
      setTitle(base ? `${base} special` : "");
    }
  }, [selectedProduct]);

  const derivedPct = useMemo(() => pctOff(compareAt, salePrice), [compareAt, salePrice]);

  const offerLabel = useMemo(() => {
    if (offerText.trim()) return offerText.trim();
    if (derivedPct != null && Number.isFinite(derivedPct)) return `${derivedPct}% OFF`;
    if (salePrice.trim() && compareAt.trim()) {
      const s = Number(salePrice);
      const c = Number(compareAt);
      if (Number.isFinite(s) && s > 0) return `Now ${formatGhc(s)}${c > s ? ` · was ${formatGhc(c)}` : ""}`;
    }
    return "Special offer";
  }, [offerText, derivedPct, salePrice, compareAt]);

  const draftPayload = () => ({
    creationKind,
    title,
    description,
    terms,
    offerText,
    productId,
    startsAt,
    endsAt,
    noEndDiscount,
    tagBadge,
    compareAt,
    salePrice,
    soldPercent,
    imageUrl
  });

  const saveDraftLocal = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload()));
    toast("Draft saved on this device.", { variant: "success" });
  };

  const buildSubtitle = () => {
    const desc = description.trim().slice(0, DESC_MAX);
    const t = terms.trim().slice(0, TERMS_MAX);
    if (!t) return desc;
    const merged = `${desc}${desc ? "\n\n" : ""}Terms: ${t}`;
    return merged.slice(0, 500);
  };

  const publish = async () => {
    setSubmitErr("");
    if (!accessToken) return;
    if (!title.trim()) {
      setSubmitErr("Add a promo title shoppers will recognize.");
      return;
    }
    if (!productId.trim()) {
      setSubmitErr("Choose the listing this promo applies to.");
      return;
    }
    const cmp = compareAt.trim() !== "" ? Number(compareAt) : NaN;
    const sale = salePrice.trim() !== "" ? Number(salePrice) : NaN;
    if (!(Number.isFinite(cmp) && cmp > 0 && Number.isFinite(sale) && sale > 0)) {
      setSubmitErr("Enter valid original and promo prices.");
      return;
    }
    if (!(sale < cmp)) {
      setSubmitErr("Promo price should be lower than the original price.");
      return;
    }

    const sendEnds =
      creationKind === "deal_discount" && noEndDiscount ? undefined : endsAt ? new Date(endsAt).toISOString() : undefined;

    if (creationKind !== "deal_discount" && !sendEnds) {
      setSubmitErr("Pick when this promo ends.");
      return;
    }

    const body = {
      kind: creationKind,
      title: title.trim(),
      subtitle: buildSubtitle(),
      productId: productId.trim(),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: sendEnds ?? null,
      tagBadge: (offerText.trim() || tagBadge.trim() || "SALE").slice(0, 24),
      gradientKey: "violet",
      imageUrl: imageUrl.trim() || null,
      compareAtGhs: cmp,
      salePriceGhs: sale,
      discountPercent: derivedPct != null ? derivedPct : null,
      soldPercent: soldPercent.trim() !== "" ? Number(soldPercent) : null,
      freeDelivery: false,
      priority: 0
    };

    setBusy(true);
    try {
      await apiFetch("/api/vendor/promotions", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: body
      });
      localStorage.removeItem(DRAFT_KEY);
      toast("Promo submitted — admin will review before it goes live on shop & deals.", { variant: "success" });
      onSuccess?.();
    } catch (e) {
      setSubmitErr(e.message || "Could not publish promo");
    } finally {
      setBusy(false);
    }
  };

  const onImagePick = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !accessToken) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Image must be 5 MB or smaller.", { variant: "error" });
      return;
    }
    setUploadBusy(true);
    try {
      const data = await apiUploadProductImages([file], accessToken);
      const url = data?.urls?.[0] || data?.imageUrls?.[0];
      if (url) setImageUrl(url);
      else toast("Upload failed — try again.", { variant: "error" });
    } catch (ex) {
      toast(ex.message || "Upload failed", { variant: "error" });
    } finally {
      setUploadBusy(false);
    }
  };

  const form = { title, description, endsAt, tagBadge, imageUrl, salePrice, compareAt };

  return h(
    "div",
    {
      className:
        "min-h-[calc(100vh-8rem)] rounded-3xl bg-gradient-to-br from-[#faf8f5] via-white to-sky-50/80 p-4 dark:from-night-950 dark:via-night-950 dark:to-sky-950/20 sm:p-6 lg:p-8"
    },
    [
      h(
        "button",
        {
          type: "button",
          className:
            "mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
          onClick: onCancel
        },
        [h(ArrowLeft, { className: "h-4 w-4" }), "Back to my promos"]
      ),
      h(
        "div",
        { className: "mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10 xl:gap-14" },
        [
          h("aside", { key: "left", className: "flex flex-col" }, [
            h("div", { key: "copy", className: "mb-8 lg:mb-10" }, [
              h(
                "h1",
                {
                  className:
                    "font-display text-3xl font-bold leading-tight text-slate-900 dark:text-white sm:text-4xl"
                },
                [
                  "Let's get you ",
                  h(
                    "span",
                    {
                      className:
                        "bg-gradient-to-r from-fuchsia-600 to-violet-600 bg-clip-text font-serif italic text-transparent dark:from-fuchsia-400 dark:to-violet-400"
                    },
                    "Promoted"
                  ),
                  " & discovered"
                ]
              ),
              h(
                "p",
                { className: "mt-3 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400" },
                `Share what makes your offer special and reach more buyers browsing ${SITE_NAME}.`
              )
            ]),
            h("div", { key: "preview", className: "flex flex-1 flex-col items-center lg:items-start" }, [
              h(PromoPhonePreview, { form, storeLabel, product: selectedProduct, offerLabel }),
              h(
                "p",
                { className: "mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400 lg:text-left" },
                "Live preview — updates as you type"
              )
            ]),
            h(
              "div",
              {
                key: "tips",
                className:
                  "mt-8 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 dark:border-amber-500/20 dark:bg-amber-950/20"
              },
              [
                h("div", { className: "flex items-center gap-2 text-amber-900 dark:text-amber-200" }, [
                  h(Lightbulb, { className: "h-4 w-4 shrink-0" }),
                  h("p", { className: "text-sm font-bold" }, "Tips for a great promo")
                ]),
                h("ul", { className: "mt-3 space-y-2 text-xs leading-relaxed text-amber-950/85 dark:text-amber-100/85" }, [
                  h("li", { key: "1" }, "• Lead with what buyers save or receive free"),
                  h("li", { key: "2" }, "• Use a bright, clear photo — food shots work best"),
                  h("li", { key: "3" }, "• Set a real end date for flash sales to create urgency"),
                  h("li", { key: "4" }, "• Keep terms short so shoppers trust the offer")
                ])
              ]
            )
          ]),

          h(
            "div",
            {
              key: "form-card",
              className:
                "rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-night-900/90 sm:p-7 lg:p-8"
            },
            [
              h("div", { key: "hdr", className: "mb-6 flex items-start gap-3" }, [
                h(
                  "span",
                  {
                    className:
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                  },
                  h(Tag, { className: "h-5 w-5" })
                ),
                h("div", {}, [
                  h("h2", { className: "font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl" }, "Create your promo"),
                  h(
                    "p",
                    { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" },
                    "Fill in the details below — we'll show buyers a polished card after admin approval."
                  )
                ])
              ]),

              h("div", { key: "kind", className: "mb-5 flex flex-wrap gap-2" }, [
                ...DEAL_KINDS.map((k) =>
                  h(
                    "button",
                    {
                      key: k.id,
                      type: "button",
                      onClick: () => setCreationKind(k.id),
                      className: `rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        creationKind === k.id
                          ? "bg-violet-700 text-white shadow-md shadow-violet-900/20"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 dark:border-white/10 dark:bg-night-950 dark:text-slate-300"
                      }`
                    },
                    k.label
                  )
                )
              ]),
              h(
                "p",
                { key: "kind-h", className: "mb-5 text-xs text-slate-500 dark:text-slate-400" },
                DEAL_KINDS.find((k) => k.id === creationKind)?.hint || ""
              ),

              h(Field, { label: "Promo title", key: "title" }, [
                h(TextInput, {
                  value: title,
                  onChange: (e) => setTitle(e.target.value),
                  placeholder: "e.g. Weekend jollof combo special",
                  maxLength: 120
                })
              ]),

              h(Field, { label: "Listing this promo applies to", key: "prod" }, [
                inventoryErr && h(InlineNotice, { key: "ie", variant: "warning", className: "!mb-2" }, inventoryErr),
                h(
                  "select",
                  {
                    className:
                      "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-night-950",
                    value: productId,
                    onChange: (e) => setProductId(e.target.value)
                  },
                  [
                    h("option", { value: "" }, "Select a product…"),
                    ...products.map((p) =>
                      h("option", { key: p.id, value: String(p.id) }, `${p.name.slice(0, 55)} (${formatGhc(Number(p.price) || 0)})`)
                    )
                  ]
                )
              ]),

              h(Field, { label: "What's included?", key: "desc" }, [
                h(TextArea, {
                  value: description,
                  onChange: (e) => setDescription(e.target.value.slice(0, DESC_MAX)),
                  rows: 4,
                  placeholder: "Describe portions, extras, bundle items, or why this deal is worth it…"
                }),
                h(
                  "p",
                  { className: "mt-1 text-right text-[11px] text-slate-400" },
                  `${description.length}/${DESC_MAX}`
                )
              ]),

              h("div", { key: "prices", className: "grid gap-4 sm:grid-cols-2" }, [
                h(Field, { label: "Original price (GH₵)", key: "cmp" }, [
                  h(TextInput, { type: "number", min: 0, step: 0.01, value: compareAt, onChange: (e) => setCompareAt(e.target.value) })
                ]),
                h(Field, { label: "Promo price (GH₵)", key: "sale" }, [
                  h(TextInput, { type: "number", min: 0, step: 0.01, value: salePrice, onChange: (e) => setSalePrice(e.target.value) })
                ])
              ]),

              derivedPct != null &&
                h(
                  "p",
                  {
                    key: "pct",
                    className: "mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200"
                  },
                  `${derivedPct}% off — shown automatically on your promo card`
                ),

              h(Field, { label: "Discount / offer label (optional)", key: "offer" }, [
                h(TextInput, {
                  value: offerText,
                  onChange: (e) => setOfferText(e.target.value),
                  placeholder: derivedPct != null ? `${derivedPct}% OFF` : "e.g. Buy 2 get 1 free"
                })
              ]),

              h("div", { key: "dates", className: "grid gap-4 sm:grid-cols-2" }, [
                h(Field, { label: "Valid from", key: "start" }, [
                  h("div", { className: "relative" }, [
                    h(TextInput, {
                      type: "datetime-local",
                      value: startsAt,
                      onChange: (e) => setStartsAt(e.target.value),
                      className: "!pr-10"
                    }),
                    h(Calendar, {
                      className: "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    })
                  ])
                ]),
                h(Field, { label: "Valid until", key: "end" }, [
                  h("div", { className: "relative" }, [
                    h(TextInput, {
                      type: "datetime-local",
                      disabled: creationKind === "deal_discount" && noEndDiscount,
                      value: endsAt,
                      onChange: (e) => setEndsAt(e.target.value),
                      className: "!pr-10"
                    }),
                    h(Calendar, {
                      className: "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    })
                  ])
                ])
              ]),

              creationKind === "deal_discount" &&
                h("label", { key: "noe", className: "mb-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400" }, [
                  h("input", {
                    type: "checkbox",
                    checked: noEndDiscount,
                    className: "h-4 w-4 accent-violet-600",
                    onChange: (e) => setNoEndDiscount(e.target.checked)
                  }),
                  h("span", null, "No end date (ongoing discount until you end it)")
                ]),

              creationKind === "flash_sale" &&
                h(Field, { label: '"Claimed" urgency % (optional)', key: "urg" }, [
                  h(TextInput, {
                    type: "number",
                    min: 0,
                    max: 100,
                    value: soldPercent,
                    onChange: (e) => setSoldPercent(e.target.value),
                    placeholder: "e.g. 68"
                  })
                ]),

              h(Field, { label: "Promo image", key: "img" }, [
                h(
                  "div",
                  {
                    className:
                      "relative flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-6 text-center dark:border-white/15 dark:bg-night-950/50"
                  },
                  [
                    imageUrl
                      ? h("img", {
                          key: "prev",
                          src: imageUrl,
                          alt: "",
                          className: "mb-3 max-h-32 rounded-xl object-cover shadow-md"
                        })
                      : h(ImagePlus, { key: "ic", className: "mb-2 h-9 w-9 text-slate-400" }),
                    h("p", { className: "text-xs text-slate-500 dark:text-slate-400" }, "Recommended 1200 × 800px · Max 5MB"),
                    h("input", {
                      ref: fileRef,
                      type: "file",
                      accept: "image/jpeg,image/png,image/webp,image/gif",
                      className: "hidden",
                      onChange: (ev) => void onImagePick(ev)
                    }),
                    h(
                      "div",
                      { className: "mt-3 flex flex-wrap justify-center gap-2" },
                      [
                        h(
                          Button,
                          {
                            type: "button",
                            variant: "primary",
                            className: "!rounded-xl !px-4 !py-2 !text-xs",
                            loading: uploadBusy,
                            onClick: () => fileRef.current?.click()
                          },
                          uploadBusy ? "Uploading…" : "Upload image"
                        ),
                        imageUrl &&
                          h(
                            Button,
                            {
                              type: "button",
                              variant: "ghost",
                              className: "!rounded-xl !px-3 !py-2 !text-xs",
                              onClick: () => setImageUrl("")
                            },
                            "Remove"
                          )
                      ].filter(Boolean)
                    )
                  ]
                )
              ]),

              h(Field, { label: "Terms & conditions (optional)", key: "terms" }, [
                h(TextArea, {
                  value: terms,
                  onChange: (e) => setTerms(e.target.value.slice(0, TERMS_MAX)),
                  rows: 3,
                  placeholder: "One per customer, while stocks last, etc."
                }),
                h("p", { className: "mt-1 text-right text-[11px] text-slate-400" }, `${terms.length}/${TERMS_MAX}`)
              ]),

              h(
                "div",
                {
                  key: "protip",
                  className:
                    "mb-5 flex gap-3 rounded-2xl border border-fuchsia-200/80 bg-fuchsia-50/80 p-3 dark:border-fuchsia-500/20 dark:bg-fuchsia-950/20"
                },
                [
                  h(Star, { className: "mt-0.5 h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400" }),
                  h("p", { className: "text-xs leading-relaxed text-fuchsia-950/90 dark:text-fuchsia-100/90" }, [
                    h("span", { className: "font-bold" }, "Pro tip: "),
                    "Clear photos and a specific discount convert better than vague “sale” wording."
                  ])
                ]
              ),

              submitErr && h(InlineNotice, { key: "se", variant: "error", className: "mb-4", onDismiss: () => setSubmitErr("") }, submitErr),

              h("div", { key: "actions", className: "flex flex-col gap-3 sm:flex-row sm:flex-wrap" }, [
                h(
                  Button,
                  {
                    type: "button",
                    variant: "ghost",
                    className: "!rounded-2xl border-violet-300/60 dark:border-violet-500/30",
                    onClick: saveDraftLocal
                  },
                  "Save as draft"
                ),
                h(
                  Button,
                  {
                    type: "button",
                    variant: "primary",
                    className: "!rounded-2xl !px-6",
                    loading: busy,
                    onClick: () => void publish()
                  },
                  [h(Send, { className: "h-4 w-4" }), "Publish promo"]
                )
              ]),

              h(
                "p",
                {
                  key: "foot",
                  className: "mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-slate-500 dark:text-slate-400"
                },
                [h(Shield, { className: "h-3.5 w-3.5 shrink-0" }), "Your promo is reviewed before going live on shop & deals"]
              )
            ]
          )
        ]
      )
    ]
  );
}
