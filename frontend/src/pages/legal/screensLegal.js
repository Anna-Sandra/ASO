import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "context";
import { h } from "utils/h";
import { GlassPanel, LogoMark, ThemeToggleButton } from "components/ui";
import { SITE_NAME, SITE_TAGLINE } from "config/brand";

function LegalHeader() {
  const { dark, toggle } = useTheme();
  return h("div", { className: "page-topbar" }, [
    h("div", { className: "page-topbar-inner" }, [
      h(Link, { to: "/", className: "flex items-center gap-2" }, [
        h(LogoMark, { key: "lm", className: "h-9 w-9" }),
        h("span", { key: "t", className: "font-display text-lg font-bold text-sky-700 dark:text-sky-300" }, "SHOPIQGH")
      ]),
      h("div", { className: "flex items-center gap-2" }, [
        h(
          Link,
          {
            key: "back",
            to: "/",
            className: "hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:inline dark:text-slate-400 dark:hover:text-white"
          },
          "Home"
        ),
        h(ThemeToggleButton, { key: "th", dark, onToggle: toggle })
      ])
    ])
  ]);
}

function proseWrap(children) {
  return h(
    "div",
    {
      className:
        "prose prose-slate max-w-none dark:prose-invert prose-headings:font-display prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-li:text-slate-600 dark:prose-li:text-slate-300 prose-strong:text-slate-800 dark:prose-strong:text-slate-100"
    },
    children
  );
}

/** Who we are — public marketing / trust page for browsers and users. */
export function AboutUsPage() {
  return h("div", { className: "page-app-shell" }, [
    h(LegalHeader, { key: "hdr" }),
    h("div", { key: "main", className: "mx-auto max-w-3xl px-4 py-8 sm:px-6" }, [
      h(
        Link,
        {
          to: "/",
          className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
        },
        [h(ArrowLeft, { key: "i", className: "h-4 w-4" }), h("span", { key: "t" }, "Back to shop")]
      ),
      h(GlassPanel, null, [
        h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, `About ${SITE_NAME}`),
        h("p", { className: "mt-2 text-sm font-medium text-sky-700 dark:text-sky-300" }, SITE_TAGLINE),
        h("div", { className: "mt-6 space-y-6 text-sm leading-relaxed" }, [
          proseWrap([
            h("section", { key: "ab1" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, `What ${SITE_NAME} is`),
              h(
                "p",
                { className: "mt-2" },
                `${SITE_NAME} is Ghana’s marketplace — a place to discover clothing, electronics, groceries, beauty, baby & infant essentials, books, professional services, and more from independent sellers and businesses. We provide the storefronts, discovery tools, checkout, and support rails; sellers are responsible for their listings and fulfilment unless the platform provides a specific service (for example integrated payments or courier programs where available).`
              )
            ]),
            h("section", { key: "ab2" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Shopping with us"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "Browse by category, search, or visit a store’s page to see what’s in stock."),
                h("li", null, "Create an account when you want order history, messages, and saved items — or check out as a guest for eligible products when the flow allows."),
                h("li", null, "Payments are processed securely through our partners (for example card or mobile money via Paystack where enabled)."),
                h(
                  "li",
                  null,
                  [
                    "Questions? Visit ",
                    h(Link, { to: "/support", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" }, "Help & support"),
                    "."
                  ]
                )
              ])
            ]),
            h("section", { key: "ab3" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Selling on the marketplace"),
              h(
                "p",
                { className: "mt-2" },
                "Vendors use SHOPIQGH to run storefronts, manage listings, and reach buyers across Ghana. Applications are reviewed to help keep listings trustworthy. If you’d like to sell here, start from the vendor application in the app."
              ),
              h("p", { className: "mt-3" }, [
                h(
                  Link,
                  { to: "/apply-vendor", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" },
                  "Become a seller →"
                )
              ])
            ]),
            h("section", { key: "ab4" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Policies"),
              h("p", { className: "mt-2" }, [
                "Our ",
                h(Link, { to: "/terms", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" }, "Terms & Conditions"),
                " describe how the service works, payments, and responsibilities for buyers and sellers. We may update features and policies over time; check the app for the latest."
              ])
            ])
          ])
        ])
      ])
    ])
  ]);
}

/** Platform-wide terms (buyers, browsers, and account holders). */
export function TermsAndConditionsPage() {
  return h("div", { className: "page-app-shell" }, [
    h(LegalHeader, { key: "hdr" }),
    h("div", { key: "main", className: "mx-auto max-w-3xl px-4 py-8 sm:px-6" }, [
      h(
        Link,
        {
          to: "/",
          className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
        },
        [h(ArrowLeft, { key: "i", className: "h-4 w-4" }), h("span", { key: "t" }, "Back to shop")]
      ),
      h(GlassPanel, null, [
        h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Terms & Conditions"),
        h("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" }, "Last updated: 24 April 2026. Please read these terms carefully before using SHOPIQGH."),
        h("div", { className: "mt-6 space-y-6 text-sm leading-relaxed" }, [
          proseWrap([
            h("section", { key: "1" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "1. Who we are"),
              h(
                "p",
                { className: "mt-2" },
                "SHOPIQGH (“we”, “us”, “our”) is an online marketplace that connects buyers in Ghana with independent sellers offering goods and services. We provide the platform, technology, and tools; unless stated otherwise, we are not the seller of items listed on the site and we do not take ownership of your purchases."
              )
            ]),
            h("section", { key: "2" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "2. Agreement"),
              h(
                "p",
                { className: "mt-2" },
                "By creating an account, accessing our website, or placing an order, you agree to these Terms & Conditions and to our other policies (including vendor rules, where applicable) as updated from time to time. If you do not agree, you must not use the service."
              )
            ]),
            h("section", { key: "3" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "3. Eligibility and accounts"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "You must be able to form a binding contract in your country of residence. If you use SHOPIQGH on behalf of an organization, you represent that you have authority to bind that organization."),
                h("li", null, "You are responsible for keeping your login details confidential and for all activity under your account."),
                h("li", null, "We may refuse registration, suspend, or close accounts that violate these terms or to protect the community.")
              ])
            ]),
            h("section", { key: "4" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "4. Marketplace and third parties"),
              h(
                "p",
                { className: "mt-2" },
                "Transactions are between you and the relevant seller. Sellers are responsible for their listings, stock, pricing, taxes where applicable, and (unless the platform offers integrated shipping) delivery or pickup arrangements. We may help facilitate payment or messaging, but that does not make us a party to the sale, except where we explicitly state otherwise."
              )
            ]),
            h("section", { key: "5" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "5. Orders and payments"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "When you place an order, you offer to buy at the price and terms shown. The seller or our systems may accept or reject that offer according to the seller’s and platform rules."),
                h("li", null, "Payment may be processed by us or by third-party providers (e.g. card or mobile money gateways). You agree to their terms when you choose a payment method."),
                h("li", null, "You must provide accurate payment and contact information. You may not use stolen payment methods or manipulate transactions.")
              ])
            ]),
            h("section", { key: "6" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "6. Prohibited and restricted items / conduct"),
              h("p", { className: "mt-2" }, "You must not use SHOPIQGH to list, request, or facilitate:"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "Illegal, unsafe, or counterfeit goods, or items that require a license you do not have."),
                h("li", null, "Harassment, fraud, or abuse toward users or our staff."),
                h("li", null, "Circumventing fees, the checkout flow, or our safety and verification processes."),
                h("li", null, "Malware, scraping that degrades the service, or attempts to access accounts or data you are not authorized to use.")
              ]),
              h("p", { className: "mt-2" }, "We may remove content, limit features, or cooperate with authorities where required.")
            ]),
            h("section", { key: "7" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "7. Reviews, messages, and content"),
              h(
                "p",
                { className: "mt-2" },
                "You grant us a license to host, display, and process content you post (e.g. reviews, images, messages) for operating and improving the service. You must have rights to what you post. We may remove content that breaks these terms or our community standards."
              )
            ]),
            h("section", { key: "8" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "8. Disputes, refunds, and liability"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h(
                  "li",
                  null,
                  "For order issues, contact the seller first; we may offer dispute or reporting tools. Refunds depend on the seller, payment method, and our policies in force at the time."
                ),
                h(
                  "li",
                  null,
                  "To the maximum extent permitted by law, SHOPIQGH and its operators are not liable for indirect, incidental, or consequential damages, or for loss of profit, data, or goodwill, arising from your use of the platform."
                ),
                h(
                  "li",
                  null,
                  "Our total liability for any claim related to the service (except where the law does not allow a cap) is limited to the greater of: (a) amounts you paid to us in fees for the service in the three (3) months before the claim, or (b) a nominal amount if no fees were paid to us. Some jurisdictions do not allow certain limitations; in those cases our liability is limited to the fullest extent allowed."
                )
            ])
            ]),
            h("section", { key: "9" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "9. Service changes and availability"),
              h(
                "p",
                { className: "mt-2" },
                "We may modify, suspend, or discontinue features with reasonable notice where practicable. The service is provided “as is” without warranties of uninterrupted or error-free operation, except as required by law."
              )
            ]),
            h("section", { key: "10" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "10. Governing law and contact"),
              h(
                "p",
                { className: "mt-2" },
                "These terms are intended to be interpreted in line with the laws of the jurisdiction in which SHOPIQGH primarily operates, without regard to conflict-of-law rules, except where consumer protections in your country cannot be waived."
              ),
              h(
                "p",
                { className: "mt-3" },
                "For questions about these terms, use the contact or support options shown in the app (e.g. profile, help, or your institution’s support channel where applicable)."
              )
            ])
          ])
        ])
      ])
    ])
  ]);
}

/** Rules that apply to vendors (sellers) on SHOPIQGH. */
export function VendorRulesPage() {
  return h("div", { className: "page-app-shell" }, [
    h(LegalHeader, { key: "hdr" }),
    h("div", { key: "main", className: "mx-auto max-w-3xl px-4 py-8 sm:px-6" }, [
      h(
        Link,
        {
          to: "/apply-vendor",
          className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
        },
        [h(ArrowLeft, { key: "i", className: "h-4 w-4" }), h("span", { key: "t" }, "Back to vendor application")]
      ),
      h(GlassPanel, null, [
        h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "SHOPIQGH vendor rules"),
        h("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" }, "Last updated: 24 April 2026. These rules apply in addition to our general Terms & Conditions."),
        h("p", { className: "mt-3 text-sm text-slate-600 dark:text-slate-300" }, [
          "Also read the ",
          h(Link, { to: "/terms", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" }, "Terms & Conditions"),
          "."
        ]),
        h("div", { className: "mt-6 space-y-6 text-sm leading-relaxed" }, [
          proseWrap([
            h("section", { key: "v1" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "1. Application and approval"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "Selling on SHOPIQGH requires an approved vendor application. We may request identity or business verification; false information can lead to rejection or account closure."),
                h("li", null, "Approval is at our discretion. We may set limits on categories, regions, or volume."),
                h("li", null, "You must keep your business name, contact details, and location information accurate and up to date.")
              ])
            ]),
            h("section", { key: "v2" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "2. Listings and product information"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "Listings must describe the actual item, condition, and price truthfully. No bait-and-switch, hidden fees, or misleading photos."),
                h("li", null, "You may only sell items you are legally allowed to sell and that comply with our prohibited-items policy and local law."),
                h("li", null, "You are responsible for stock levels; overselling and repeated cancellations may affect your account standing.")
              ])
            ]),
            h("section", { key: "v3" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "3. Fulfillment, delivery, and handover"),
              h(
                "p",
                { className: "mt-2" },
                "Unless the platform offers a specific delivery program, you must clearly communicate how and when the buyer will receive the goods (pickup, on-site handover, third-party courier, etc.), and you must make reasonable efforts to meet the timelines you communicate."
              )
            ]),
            h("section", { key: "v4" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "4. Pricing and platform fees"),
              h(
                "p",
                { className: "mt-2" },
                "Prices shown to buyers must be clear. We may charge commissions, payment processing, or service fees as disclosed in the app or in your vendor dashboard. You agree to those fees for sales completed through the platform where applicable."
              )
            ]),
            h("section", { key: "v5" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "5. Payouts and payment details"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "You must provide valid payout or receiving instructions (e.g. mobile money or bank details) where the platform uses them, and you must keep them accurate."),
                h("li", null, "You are responsible for your own tax and reporting obligations in your jurisdiction.")
              ])
            ]),
            h("section", { key: "v6" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "6. Customer communication"),
              h(
                "p",
                { className: "mt-2" },
                "Respond to order-related messages in a professional and timely manner. Do not use our messaging to spam, promote off-platform payment solely to evade fees where platform payment is required, or to harass buyers."
              )
            ]),
            h("section", { key: "v7" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "7. Cancellations, refunds, and disputes"),
              h(
                "p",
                { className: "mt-2" },
                "You must honor applicable consumer rules and the refund/cancellation process we publish. You agree to cooperate with us in good faith when a buyer reports a problem, including by providing order evidence when asked."
              )
            ]),
            h("section", { key: "v8" }, [
              h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "8. Account standing and enforcement"),
              h("ul", { className: "mt-2 list-disc space-y-1 pl-5" }, [
                h("li", null, "We may warn, restrict listings, hold payouts, suspend, or terminate vendor access for repeated poor performance, policy breaches, or legal risk."),
                h("li", null, "You may appeal certain decisions through support where we offer a process.")
              ])
            ])
          ])
        ])
      ])
    ])
  ]);
}
