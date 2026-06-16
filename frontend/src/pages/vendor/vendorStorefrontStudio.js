import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Clock, Plus, Star, Trash2, Truck } from "lucide-react";
import { apiFetch, apiUploadProductImages, fetchBusinessStorefront, linkListingsToStore } from "services/api";
import { useAuth, useNotice } from "context";
import { h } from "utils/h";
import { buildStoreListingBlocks, prepareStorefrontListingGroups, StorefrontProductCard } from "pages/marketplace/marketplaceHubScreens";
import { storeUsesMenuSections, isServiceProviderStore } from "config/catalog";
import { Button, Field, GlassPanel, InlineNotice, TextArea } from "components/ui";
import { StoreLocationSection } from "components/vendor/StoreLocationSection";
import { StoreServiceSection } from "components/vendor/StoreServiceSection";
import { StoreSetupSidebar } from "components/vendor/StoreSetupSidebar";
import { storeStatusLabel } from "utils/storeStatus";
import { buildStoreFulfillmentDisplay } from "utils/storeFulfillmentDisplay";
import {
  businessWithStorefrontDraft,
  clearStorefrontDraftSection,
  readStorefrontDraft,
  writeStorefrontDraft
} from "utils/vendorStorefrontDraft";

const QUIET_BRAND_LINK =
  "text-[10px] font-medium text-slate-500 underline-offset-2 hover:text-sky-600 hover:underline disabled:pointer-events-none disabled:opacity-40 dark:text-slate-400 dark:hover:text-sky-400";
const QUIET_BRAND_REMOVE =
  "text-[10px] font-medium text-slate-400 underline-offset-2 hover:text-rose-600 hover:underline disabled:pointer-events-none disabled:opacity-40";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const BRAND_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const BRAND_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DESCRIPTION_MAX_CHARS = 8000;

function validateBrandImageFile(file) {
  if (!file) return "No file selected.";
  if (!BRAND_IMAGE_MIME.has(file.type)) return "Use a JPEG, PNG, or WebP image.";
  if (file.size > BRAND_IMAGE_MAX_BYTES) return "Image must be 5 MB or smaller.";
  return null;
}

/** Stable DOM id for hidden file inputs (one logo + one banner per store slug). */
function brandInputId(kind, storeSlug) {
  return `${kind}-${storeSlug.replace(/[^a-z0-9]/gi, "")}`;
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function orphanListingsBannerText(count, isFoodMenu) {
  const noun = isFoodMenu
    ? `food listing${pluralize(count, "", "s")}`
    : `listing${pluralize(count, "", "s")}`;
  const verb = count === 1 ? "is" : "are";
  const place = isFoodMenu ? "menu" : "store";
  return `${count} ${noun} ${verb} not on this ${place} yet (may be on another store or unlinked).`;
}

function unpublishedListingsBannerText(count) {
  const verb = count === 1 ? "is" : "are";
  return `${count} listing${pluralize(count, "", "s")} on this store ${verb} not published — shoppers only see published items. Open each listing from the grid below and tap Publish.`;
}

function buildPublicStoreUrl(storeSlug) {
  if (typeof window === "undefined" || !storeSlug) return "";
  return `${window.location.origin}/store/${encodeURIComponent(storeSlug)}`;
}

function mergePatchSettings(existingSettings, patchSettings) {
  if (patchSettings && typeof patchSettings === "object") {
    return { ...(existingSettings || {}), ...patchSettings };
  }
  return undefined;
}

/** Logo/banner row: hidden file input + change/remove links. */
function BrandAssetControls({ assetKind, inputId, imageUrl, uploadBusy, onSelectFile, onRemove }) {
  const isUploading = uploadBusy === assetKind;
  const label = assetKind === "logo" ? "logo" : "banner";

  return [
    h("label", { key: "change", htmlFor: inputId, className: `cursor-pointer ${QUIET_BRAND_LINK}` }, [
      h("input", {
        id: inputId,
        type: "file",
        accept: IMAGE_ACCEPT,
        className: "sr-only",
        disabled: Boolean(uploadBusy),
        onChange: (event) => {
          void onSelectFile(assetKind, event);
          event.target.value = "";
        }
      }),
      isUploading ? "Uploading…" : `Change ${label}`
    ]),
    imageUrl
      ? [
          h("span", { key: "dot", className: "text-[10px] text-slate-300 dark:text-slate-600" }, "·"),
          h(
            "button",
            {
              key: "remove",
              type: "button",
              disabled: Boolean(uploadBusy),
              className: QUIET_BRAND_REMOVE,
              onClick: () => void onRemove(assetKind)
            },
            "Remove"
          )
        ]
      : null
  ].filter(Boolean);
}

function StoreApprovalBanner({ business, canSubmit, onSubmit }) {
  if (!business?.status || business.status === "active") return null;

  const rejectionReason =
    business.status === "rejected" && business.settings?.rejectionReason
      ? String(business.settings.rejectionReason)
      : "";

  const variant =
    business.status === "pending_approval" ? "info" : business.status === "rejected" ? "error" : "warning";

  const title =
    business.status === "pending_approval"
      ? "Awaiting admin approval"
      : business.status === "rejected"
        ? "Store not approved"
        : "Draft store";

  let bodyText;
  if (business.status === "pending_approval") {
    bodyText =
      "Your storefront is hidden from shoppers until an admin approves it. You can still edit branding and listings here.";
  } else if (business.status === "rejected") {
    bodyText = rejectionReason
      ? `Admin note: ${rejectionReason} Update your store and resubmit when ready.`
      : "This store was not approved. Update details and resubmit for review.";
  } else {
    bodyText =
      "Finish setup below, then submit for admin approval. Shoppers will not see this store until it is approved.";
  }

  return h(
    InlineNotice,
    { key: "status-warn", variant, title, className: "mb-0" },
    h("div", { className: "space-y-3" }, [
      h("p", { key: "t" }, bodyText),
      canSubmit ? h(Button, { key: "pub", type: "button", onClick: () => void onSubmit() }, "Submit for approval") : null
    ])
  );
}

/** Lively storefront manager — lives inside vendor shell at /vendor/stores/:storeKey */
export function VendorStorefrontManagePage() {
  const { storeKey } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { toast } = useNotice();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [storefrontPayload, setStorefrontPayload] = useState(null);
  const [brandUploadBusy, setBrandUploadBusy] = useState("");
  const [savingPatch, setSavingPatch] = useState(false);
  const [linkingListings, setLinkingListings] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const storeSlug = String(storeKey || "").trim();
  const authHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    [accessToken]
  );

  const loadStorefront = useCallback(async () => {
    if (!storeSlug) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await fetchBusinessStorefront(storeSlug, { accessToken });
      if (data?.linkedOrphanProducts > 0) {
        toast(
          `Added ${data.linkedOrphanProducts} listing${pluralize(data.linkedOrphanProducts, "", "s")} from My products to this store.`,
          { variant: "success" }
        );
      }
      setStorefrontPayload(data);
    } catch (error) {
      setStorefrontPayload(null);
      setLoadError(String(error.message || "").trim() || "Could not load your storefront.");
    } finally {
      setLoading(false);
    }
  }, [storeSlug, accessToken, toast]);

  useEffect(() => {
    void loadStorefront();
  }, [storeSlug, loadStorefront]);

  useEffect(() => {
    const id = storefrontPayload?.business?.id;
    if (!id) return;
    const draftDesc = readStorefrontDraft(storeSlug)?.description;
    const description = storefrontPayload?.business?.description;
    setDescriptionDraft(
      typeof draftDesc === "string" ? draftDesc : description ? String(description) : ""
    );
  }, [storefrontPayload?.business?.id, storefrontPayload?.business?.updatedAt, storefrontPayload?.business?.description, storeSlug]);

  const business = useMemo(
    () => businessWithStorefrontDraft(storefrontPayload?.business || null, storeSlug),
    [storefrontPayload?.business, storeSlug]
  );
  const products = useMemo(
    () => (Array.isArray(storefrontPayload?.products) ? storefrontPayload.products : []),
    [storefrontPayload?.products]
  );
  const reviewSummary = storefrontPayload?.reviewSummary || { avgRating: null, count: 0 };

  const { grouped, unassigned, orderedSectionIds } = useMemo(
    () => prepareStorefrontListingGroups(storefrontPayload?.menuSections, products),
    [storefrontPayload?.menuSections, products]
  );

  const isFoodMenu = storeUsesMenuSections(business?.businessType);
  const isServiceStore = isServiceProviderStore(business);

  const menuBlocks = useMemo(
    () => buildStoreListingBlocks({ business, orderedSectionIds, grouped, unassigned }),
    [business, orderedSectionIds, grouped, unassigned]
  );

  const orphanListingCount = Number(storefrontPayload?.orphanListingCount) || 0;
  const unpublishedListingCount = Number(storefrontPayload?.unpublishedListingCount) || 0;
  const listingCount = products.length;

  const publicStoreUrl = useMemo(() => buildPublicStoreUrl(storeSlug), [storeSlug]);
  const fulfillmentHeroChips = useMemo(
    () => buildStoreFulfillmentDisplay(business).heroChips,
    [business]
  );

  const canSubmitForApproval = business?.status === "draft" || business?.status === "rejected";

  const logoInputId = brandInputId("vsf-logo", storeSlug);
  const bannerInputId = brandInputId("vsf-ban", storeSlug);

  const patchBusiness = useCallback(
    async (patchBody, options = {}) => {
      const { silent = false, reload = true, successMessage = "Saved." } = options;
      if (!accessToken || !storeSlug) return false;

      const mergedSettings = mergePatchSettings(business?.settings, patchBody.settings);
      const json = { ...patchBody };
      if (mergedSettings !== undefined) json.settings = mergedSettings;

      if (!silent) setSavingPatch(true);
      try {
        const updated = await apiFetch(`/api/businesses/${encodeURIComponent(storeSlug)}`, {
          method: "PATCH",
          headers: authHeaders,
          json
        });
        if (reload) {
          if (!silent && successMessage) toast(successMessage, { variant: "success" });
          await loadStorefront();
        } else if (updated?.business) {
          setStorefrontPayload((prev) =>
            prev ? { ...prev, business: { ...prev.business, ...updated.business } } : prev
          );
        }
        return true;
      } catch (error) {
        if (!silent) toast(error.message || "Could not save.", { variant: "error" });
        return false;
      } finally {
        if (!silent) setSavingPatch(false);
      }
    },
    [accessToken, storeSlug, business?.settings, authHeaders, loadStorefront, toast]
  );

  const uploadBrandAsset = useCallback(
    async (assetKind, event) => {
      const file = event.target.files?.[0];
      if (!file || !accessToken || !storeSlug) return;

      const validationError = validateBrandImageFile(file);
      if (validationError) {
        toast(validationError, { variant: "error" });
        return;
      }

      setBrandUploadBusy(assetKind);
      try {
        const uploadResult = await apiUploadProductImages([file], accessToken);
        const url = uploadResult.urls?.[0];
        if (!url || typeof url !== "string") throw new Error("Upload did not return an image URL.");

        const ok = await patchBusiness(assetKind === "logo" ? { logoUrl: url } : { bannerUrl: url }, {
          silent: true,
          reload: true,
          successMessage: ""
        });
        if (ok) {
          toast(assetKind === "logo" ? "Logo updated." : "Banner updated.", { variant: "success" });
        } else {
          toast("Could not save image to your store.", { variant: "error" });
        }
      } catch (error) {
        toast(error.message || "Upload failed.", { variant: "error" });
      } finally {
        setBrandUploadBusy("");
      }
    },
    [accessToken, storeSlug, patchBusiness, toast]
  );

  const removeBrandAsset = useCallback(
    async (assetKind) => {
      if (!accessToken || !storeSlug) return;
      setBrandUploadBusy(assetKind);
      try {
        const ok = await patchBusiness(assetKind === "logo" ? { logoUrl: null } : { bannerUrl: null }, {
          silent: true,
          reload: true,
          successMessage: ""
        });
        if (ok) {
          toast(assetKind === "logo" ? "Logo removed." : "Banner removed.", { variant: "success" });
        } else {
          toast("Could not remove image.", { variant: "error" });
        }
      } finally {
        setBrandUploadBusy("");
      }
    },
    [accessToken, storeSlug, patchBusiness, toast]
  );

  const linkOrphanListings = useCallback(async () => {
    if (!accessToken || !storeSlug) return;
    setLinkingListings(true);
    try {
      const { linked } = await linkListingsToStore(storeSlug, accessToken);
      toast(
        linked > 0
          ? `Added ${linked} listing${pluralize(linked, "", "s")} to this store${isFoodMenu ? " menu" : ""}.`
          : "No unlinked listings found.",
        { variant: linked > 0 ? "success" : "info" }
      );
      await loadStorefront();
    } catch (error) {
      toast(error.message || "Could not link listings.", { variant: "error" });
    } finally {
      setLinkingListings(false);
    }
  }, [accessToken, storeSlug, isFoodMenu, loadStorefront, toast]);

  const submitForApproval = useCallback(async () => {
    if (!accessToken || !storeSlug) return;
    if (business?.status === "active" || business?.status === "pending_approval") return;
    await patchBusiness(
      { status: "pending_approval" },
      { successMessage: "Store submitted for admin approval." }
    );
  }, [accessToken, storeSlug, business?.status, patchBusiness]);

  const deleteStore = useCallback(async () => {
    if (!accessToken || !storeSlug) return;
    const confirmed = window.confirm(
      `Delete "${business?.name || "this store"}" permanently? Listings will be unlinked from this store. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/api/businesses/${encodeURIComponent(storeSlug)}`, {
        method: "DELETE",
        headers: authHeaders
      });
      toast("Store deleted.", { variant: "success" });
      navigate("/vendor/stores", { replace: true });
    } catch (error) {
      toast(error.message || "Could not delete store.", { variant: "error" });
    }
  }, [accessToken, storeSlug, business?.name, authHeaders, navigate, toast]);

  const copyPublicStoreLink = useCallback(() => {
    if (!publicStoreUrl || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(publicStoreUrl).then(() => {
      toast("Shopper link copied.", { variant: "success" });
    });
  }, [publicStoreUrl, toast]);

  const saveDescription = useCallback(async () => {
    const trimmed = descriptionDraft.trim();
    if (trimmed.length > DESCRIPTION_MAX_CHARS) {
      toast(`Description must be ${DESCRIPTION_MAX_CHARS} characters or fewer.`, { variant: "error" });
      return;
    }
    const ok = await patchBusiness({ description: trimmed });
    if (ok) clearStorefrontDraftSection(storeSlug, "description");
  }, [descriptionDraft, patchBusiness, storeSlug, toast]);

  if (!storeSlug) {
    return h(Navigate, { to: "/vendor/stores", replace: true });
  }

  if (loading) {
    return h("div", { className: "py-20 text-center text-sm text-slate-600 dark:text-slate-400" }, "Loading your storefront…");
  }

  if (loadError) {
    return h("div", { className: "space-y-4" }, [
      h(InlineNotice, { variant: "error", title: "Could not load storefront" }, [
        h("p", { key: "m" }, loadError),
        h("p", { key: "h", className: "mt-2 text-xs opacity-90" }, `Store key: ${storeSlug}. Check that this store exists under Vendor → Stores.`)
      ]),
      h(Link, { to: "/vendor/stores", className: "text-sm font-semibold text-sky-600 hover:underline" }, "← Back to stores")
    ]);
  }

  const hasBanner = Boolean(business?.bannerUrl && String(business.bannerUrl).trim());
  const hasLogo = Boolean(business?.logoUrl && String(business.logoUrl).trim());

  const heroMedia = hasBanner
    ? h("img", { src: business.bannerUrl, alt: "", className: "absolute inset-0 h-full w-full object-cover" })
    : h("div", {
        className:
          "absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-700 dark:from-amber-500/90 dark:via-orange-600 dark:to-rose-900"
      });

  const logoCard = hasLogo
    ? h("img", {
        src: business.logoUrl,
        alt: "",
        className:
          "h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-xl ring-2 ring-sky-200/80 sm:h-24 sm:w-24 dark:border-night-950"
      })
    : h(
        "div",
        {
          className:
            "flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-dashed border-slate-200 bg-slate-50 text-2xl font-black text-slate-400 sm:h-24 sm:w-24 dark:border-white/15 dark:bg-night-950"
        },
        business?.name ? String(business.name).slice(0, 1) : "?"
      );

  return h("div", { className: "space-y-5 pb-10" }, [
    h("nav", { className: "flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500" }, [
      h(Link, { to: "/vendor/stores", className: "hover:text-sky-600" }, "My stores"),
      h(ChevronRight, { className: "h-3.5 w-3.5 opacity-60" }),
      h("span", { className: "text-slate-800 dark:text-slate-200" }, business?.name || "Storefront")
    ]),
    h(
      "header",
      {
        className:
          "flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900 sm:flex-row sm:items-center sm:justify-between"
      },
      [
        h("div", { className: "min-w-0" }, [
          h("div", { className: "flex flex-wrap items-center gap-2" }, [
            h("h1", { className: "font-display text-2xl font-black text-slate-900 dark:text-white" }, business?.name || "Your store"),
            h(
              "span",
              {
                className: `rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  business?.status === "active"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                    : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                }`
              },
              storeStatusLabel(business?.status)
            )
          ]),
          h("p", { className: "mt-1 text-sm text-slate-500" }, isServiceStore
            ? "Branding, service location, and listings — all on this page."
            : "Branding, GPS pin, service options, and menu — all on this page.")
        ]),
        h("div", { className: "flex flex-wrap gap-2" }, [
          canSubmitForApproval
            ? h(Button, { type: "button", onClick: () => void submitForApproval() }, "Submit for approval")
            : null,
          h(Button, { type: "button", variant: "outline", onClick: copyPublicStoreLink }, "Share link"),
          publicStoreUrl
            ? h("a", { href: publicStoreUrl, target: "_blank", rel: "noopener noreferrer", className: "text-xs font-bold text-sky-600 underline" }, "Preview")
            : null
        ].filter(Boolean))
      ]
    ),
    h(StoreApprovalBanner, { business, canSubmit: canSubmitForApproval, onSubmit: submitForApproval }),
    h("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,1fr)_17.5rem]" }, [
      h("div", { className: "min-w-0 space-y-5" }, [
        h(
          "section",
          {
            id: "store-branding",
            className: "scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-night-900"
          },
          [
            h("div", { className: "relative h-36 w-full overflow-hidden sm:h-44" }, [
              heroMedia,
              h("div", { className: "absolute inset-0 bg-gradient-to-t from-slate-900/35 via-transparent to-transparent" })
            ]),
            h(
              "div",
              {
                className:
                  "flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 border-b border-slate-100 px-3 py-1 dark:border-white/10"
              },
              BrandAssetControls({
                assetKind: "banner",
                inputId: bannerInputId,
                imageUrl: business?.bannerUrl,
                uploadBusy: brandUploadBusy,
                onSelectFile: uploadBrandAsset,
                onRemove: removeBrandAsset
              })
            ),
            h("div", { className: "border-t border-slate-100 px-5 pb-5 dark:border-white/10 sm:px-6" }, [
              h("div", { className: "flex flex-col gap-5 sm:flex-row sm:items-start" }, [
                h("div", { className: "-mt-10 flex shrink-0 flex-col items-center sm:-mt-12 sm:items-start" }, [
                  h("div", { className: "relative" }, [logoCard]),
                  h(
                    "div",
                    { className: "mt-1.5 flex items-center justify-center gap-1 sm:justify-start" },
                    BrandAssetControls({
                      assetKind: "logo",
                      inputId: logoInputId,
                      imageUrl: business?.logoUrl,
                      uploadBusy: brandUploadBusy,
                      onSelectFile: uploadBrandAsset,
                      onRemove: removeBrandAsset
                    })
                  )
                ]),
                h("div", { className: "min-w-0 flex-1 space-y-4 pt-1 sm:pt-3" }, [
                  h("h2", { className: "font-display text-base font-bold text-slate-900 dark:text-white" }, "Store details"),
                  reviewSummary.count || fulfillmentHeroChips.length
                    ? h(
                        "div",
                        {
                          className:
                            "flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-night-950/80"
                        },
                        [
                          reviewSummary.count
                            ? h(
                                "span",
                                {
                                  className:
                                    "inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100"
                                },
                                [
                                  h(Star, { className: "h-3.5 w-3.5 fill-amber-400 text-amber-500" }),
                                  `${reviewSummary.avgRating ?? "–"} (${reviewSummary.count} reviews)`
                                ]
                              )
                            : null,
                          ...fulfillmentHeroChips.map((chip) =>
                            h(
                              "span",
                              {
                                key: chip.key,
                                className:
                                  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 dark:border-white/15 dark:bg-night-900 dark:text-slate-100"
                              },
                              [
                                chip.icon === "clock"
                                  ? h(Clock, { className: "h-3.5 w-3.5 shrink-0 text-sky-600" })
                                  : h(Truck, { className: "h-3.5 w-3.5 shrink-0 text-sky-600" }),
                                chip.label
                              ]
                            )
                          )
                        ].filter(Boolean)
                      )
                    : null,
                  h(
                    Field,
                    { label: "Short description (shown on your public shop)" },
                    h(TextArea, {
                      value: descriptionDraft,
                      onChange: (event) => {
                        const next = event.target.value;
                        setDescriptionDraft(next);
                        writeStorefrontDraft(storeSlug, { description: next });
                      },
                      rows: 3,
                      placeholder: isServiceStore
                        ? "e.g. Photography, tutoring, and design — book via Messages after checkout."
                        : "e.g. Fresh local meals, made to order. Open Mon–Sat."
                    })
                  ),
                  h(
                    Button,
                    {
                      type: "button",
                      variant: "outline",
                      className: "!text-sm",
                      loading: savingPatch,
                      disabled: savingPatch,
                      onClick: () => void saveDescription()
                    },
                    "Save description"
                  )
                ])
              ])
            ])
          ]
        ),
        h(StoreLocationSection, { business, storeSlug, onSave: patchBusiness, saving: savingPatch }),
        !isServiceStore
          ? h(StoreServiceSection, { business, storeSlug, onSave: patchBusiness, saving: savingPatch })
          : null,
        h(
          "section",
          {
            id: "store-menu",
            className: "scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900"
          },
          [
            orphanListingCount > 0
              ? h(
                  "div",
                  {
                    key: "orphan-banner",
                    className:
                      "mb-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
                  },
                  [
                    h("p", { key: "t" }, orphanListingsBannerText(orphanListingCount, isFoodMenu)),
                    h(
                      Button,
                      {
                        key: "btn",
                        type: "button",
                        variant: "outline",
                        className: "mt-2 !text-xs",
                        loading: linkingListings,
                        disabled: linkingListings,
                        onClick: () => void linkOrphanListings()
                      },
                      isFoodMenu ? "Add to this store menu" : "Add to this store"
                    )
                  ]
                )
              : null,
            unpublishedListingCount > 0
              ? h(
                  "div",
                  {
                    key: "draft-banner",
                    className:
                      "mb-4 rounded-2xl border border-sky-300/60 bg-sky-50 px-4 py-3 text-xs text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100"
                  },
                  unpublishedListingsBannerText(unpublishedListingCount)
                )
              : null,
            h("div", { className: "flex flex-wrap items-center justify-between gap-3" }, [
              h("div", null, [
                h(
                  "h2",
                  { className: "font-display text-lg font-bold text-slate-900 dark:text-white" },
                  isFoodMenu ? "Menu & listings" : isServiceStore ? "Service listings" : "Store listings"
                ),
                h(
                  "p",
                  { className: "mt-0.5 text-xs text-slate-500" },
                  isFoodMenu
                    ? "Dishes and items shoppers see on your public menu."
                    : isServiceStore
                      ? "Services shoppers see on your public store."
                      : "Products shoppers see on your public store."
                )
              ]),
              h(
                Link,
                {
                  to: `/vendor/products/new?store=${encodeURIComponent(storeSlug)}`,
                  className:
                    "inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-500"
                },
                [h(Plus, { className: "h-4 w-4" }), "Add listing"]
              )
            ]),
            menuBlocks.length
              ? h("div", { className: "mt-8 space-y-8" }, [
                  ...menuBlocks.map((block) =>
                    h("div", { key: block.key }, [
                      h("div", { className: "mb-3 flex items-end justify-between border-b border-slate-200 pb-2 dark:border-white/10" }, [
                        h("h3", { className: "font-display text-base font-bold text-slate-900 dark:text-white" }, block.title),
                        h("span", { className: "text-xs font-semibold text-slate-500" }, `${block.items.length} items`)
                      ]),
                      h(
                        "div",
                        { className: "grid gap-4 sm:grid-cols-2" },
                        block.items.map((product) =>
                          h(StorefrontProductCard, { key: product.id, product, business, vendorMode: true })
                        )
                      )
                    ])
                  )
                ])
              : h(
                  GlassPanel,
                  { className: "mt-6 text-center" },
                  h("div", { className: "space-y-3 py-4" }, [
                    h("p", { className: "text-sm text-slate-600 dark:text-slate-300" }, "No listings on this storefront yet."),
                    h(
                      Link,
                      {
                        to: `/vendor/products/new?store=${encodeURIComponent(storeSlug)}`,
                        className: "inline-block text-sm font-bold text-sky-600 hover:underline"
                      },
                      "+ Add your first listing"
                    )
                  ])
                )
          ]
        ),
        h(
          "section",
          {
            className:
              "rounded-2xl border border-rose-200/80 bg-rose-50/50 p-5 dark:border-rose-500/25 dark:bg-rose-950/20"
          },
          [
            h("h2", { className: "font-display text-sm font-bold text-rose-900 dark:text-rose-100" }, "Danger zone"),
            h("p", { className: "mt-1 text-xs text-rose-800/90 dark:text-rose-200/80" }, "Permanently delete this store. Your listings will be unlinked but not deleted."),
            h(
              Button,
              {
                type: "button",
                variant: "outline",
                className: "mt-3 gap-2 border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-200",
                onClick: () => void deleteStore()
              },
              [h(Trash2, { className: "h-4 w-4" }), "Delete store"]
            )
          ]
        )
      ]),
      h(StoreSetupSidebar, {
        business,
        listingCount,
        reviewCount: reviewSummary.count,
        slug: storeSlug,
        onSubmit: () => void submitForApproval(),
        canSubmit: canSubmitForApproval
      })
    ])
  ]);
}
