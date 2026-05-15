import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  AuthProvider,
  useAuth,
  CartProvider,
  NoticeProvider,
  NotificationProvider,
  ThemeProvider
} from "./contexts";
import { SavedProductsProvider } from "./savedProductsContext";
import {
  ForgotPasswordPage,
  LoginPage,
  LoginOtpPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage
} from "./screensAuth";
import {
  BuyerHelpSupportPage,
  BuyerMessagesPage,
  BuyerNotificationsPage,
  BuyerOrdersPage,
  CheckoutPage,
  PaymentCancelPage,
  PaymentSuccessPage,
  ProductDetailPage,
  ProfilePage,
  ShopPage,
  SavedProductsPage
} from "./screensBuyer";
import { CourierApplicationPage } from "./screensCourierApply";
import { VendorApplicationPage } from "./screensVendorApply";
import { CategoryHubPage, BusinessStorefrontPage } from "./marketplaceHubScreens";
import { VendorStoresPage } from "./vendorBusinessStudio";
import { VendorStoreMenuPage } from "./vendorStoreMenu";
import { VendorOnboardingPage } from "./vendorOnboardingWizard";
import { VendorServiceInquiriesPage } from "./vendorServiceInquiries";
import { BuyerReportsPage, VendorReportsPage } from "./screensUserReports";
import { TermsAndConditionsPage, VendorRulesPage } from "./screensLegal";
import { AdminPage } from "./screensAdmin";
import { AdminLoginPage, AdminLoginOtpPage } from "./screensAdminLogin";
import RiderDashboard from "./RiderDashboard";
import { h } from "./h";
import {
  VendorAddProductPage,
  VendorAnalyticsPage,
  VendorDashboardPage,
  VendorEditProductPage,
  VendorMessagesPage,
  VendorNotificationsPage,
  VendorOrdersPage,
  VendorProductsPage,
  VendorProfilePage,
  VendorReviewsPage,
  VendorSettingsPage,
  VendorShell
} from "./screensVendor";

function FullScreenLoading() {
  return h(
    "div",
    { className: "flex min-h-screen items-center justify-center bg-night-950 text-slate-300" },
    "Loading…"
  );
}

function VendorGate({ children }) {
  const { accessToken, loading, user } = useAuth();
  if (loading) {
    return h(FullScreenLoading);
  }
  if (!accessToken) {
    return h(Navigate, { to: "/login", replace: true, state: { from: "vendor" } });
  }
  if (user && user.role && user.role !== "seller") {
    if (user.role === "admin") {
      return h(Navigate, { to: "/admin", replace: true });
    }
    if (user.role === "rider") {
      return h(Navigate, { to: "/rider", replace: true });
    }
    return h(Navigate, { to: "/login", replace: true, state: { from: "vendor" } });
  }
  return children;
}

function BuyerGate({ children }) {
  const { accessToken, loading, user } = useAuth();
  if (loading) {
    return h(FullScreenLoading);
  }
  if (accessToken && user?.role === "admin") {
    return h(Navigate, { to: "/admin", replace: true });
  }
  if (accessToken && user?.role === "seller") {
    return h(Navigate, { to: "/vendor/dashboard", replace: true });
  }
  if (accessToken && user?.role === "rider") {
    return h(Navigate, { to: "/rider", replace: true });
  }
  return children;
}

/** Buyer routes that need an account (checkout, profile, payment). */
function AdminGate({ children }) {
  const { accessToken, loading, user } = useAuth();
  if (loading) {
    return h(FullScreenLoading);
  }
  if (!accessToken) {
    return h(Navigate, { to: "/admin/login", replace: true, state: { from: "/admin" } });
  }
  if (user && user.role !== "admin") {
    return h(Navigate, { to: "/", replace: true });
  }
  return children;
}

function RiderGate({ children }) {
  const { accessToken, loading, user } = useAuth();
  if (loading) {
    return h(FullScreenLoading);
  }
  if (!accessToken) {
    return h(Navigate, { to: "/login", replace: true, state: { from: "/rider" } });
  }
  if (user?.role === "admin") {
    return h(Navigate, { to: "/admin", replace: true });
  }
  if (user?.role === "seller") {
    return h(Navigate, { to: "/vendor/dashboard", replace: true });
  }
  if (user?.role !== "rider") {
    return h(Navigate, { to: "/", replace: true });
  }
  return children;
}

function RequireBuyerAuth({ children }) {
  const { accessToken, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return h(FullScreenLoading);
  }
  if (!accessToken) {
    return h(Navigate, { to: "/login", replace: true, state: { from: loc.pathname + (loc.search || "") } });
  }
  return children;
}

function AppRoutes() {
  return h(
    Routes,
    null,
    h(Route, { path: "/shop", element: h(Navigate, { to: "/", replace: true }), key: "r-shop-legacy" }),
    h(Route, { path: "/", element: h(BuyerGate, null, h(ShopPage)), key: "r-root" }),
    h(Route, { path: "/food", element: h(BuyerGate, null, h(CategoryHubPage, { slug: "food" })), key: "r-food" }),
    h(Route, {
      path: "/fashion",
      element: h(BuyerGate, null, h(CategoryHubPage, { slug: "fashion" })),
      key: "r-fashion"
    }),
    h(Route, {
      path: "/electronics",
      element: h(BuyerGate, null, h(CategoryHubPage, { slug: "electronics" })),
      key: "r-electron"
    }),
    h(Route, {
      path: "/beauty",
      element: h(BuyerGate, null, h(CategoryHubPage, { slug: "beauty" })),
      key: "r-beauty"
    }),
    h(Route, {
      path: "/groceries",
      element: h(BuyerGate, null, h(CategoryHubPage, { slug: "groceries" })),
      key: "r-groceries"
    }),
    h(Route, {
      path: "/books",
      element: h(BuyerGate, null, h(CategoryHubPage, { slug: "books" })),
      key: "r-books"
    }),
    h(Route, {
      path: "/services",
      element: h(BuyerGate, null, h(CategoryHubPage, { slug: "services" })),
      key: "r-services-hub"
    }),
    h(Route, {
      path: "/store/:slug",
      element: h(BuyerGate, null, h(BusinessStorefrontPage)),
      key: "r-store"
    }),
    h(Route, {
      path: "/products/:productId",
      element: h(BuyerGate, null, h(ProductDetailPage)),
      key: "r-product"
    }),
    h(Route, { path: "/saved", element: h(BuyerGate, null, h(SavedProductsPage)), key: "r-saved" }),
    h(Route, { path: "/admin/login", element: h(AdminLoginPage), key: "r-admin-login" }),
    h(Route, { path: "/admin/login-otp", element: h(AdminLoginOtpPage), key: "r-admin-login-otp" }),
    h(Route, { path: "/admin", element: h(AdminGate, null, h(AdminPage)), key: "r-admin" }),
    h(Route, { path: "/login", element: h(LoginPage), key: "r-login" }),
    h(Route, { path: "/login-otp", element: h(LoginOtpPage), key: "r-login-otp" }),
    h(Route, { path: "/register", element: h(RegisterPage), key: "r-register" }),
    h(Route, { path: "/verify-email", element: h(VerifyEmailPage), key: "r-verify" }),
    h(Route, { path: "/forgot-password", element: h(ForgotPasswordPage), key: "r-forgot" }),
    h(Route, { path: "/reset-password", element: h(ResetPasswordPage), key: "r-reset" }),
    h(Route, { path: "/terms", element: h(TermsAndConditionsPage), key: "r-terms" }),
    h(Route, { path: "/support", element: h(BuyerGate, null, h(BuyerHelpSupportPage)), key: "r-support" }),
    h(Route, { path: "/vendor-rules", element: h(VendorRulesPage), key: "r-vendor-rules" }),
    h(Route, {
      path: "/checkout",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(CheckoutPage))),
      key: "r-checkout"
    }),
    h(Route, {
      path: "/profile",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(ProfilePage))),
      key: "r-profile"
    }),
    h(Route, {
      path: "/apply-vendor",
      element: h(BuyerGate, null, h(VendorApplicationPage)),
      key: "r-apply-vendor"
    }),
    h(Route, {
      path: "/apply-courier",
      element: h(BuyerGate, null, h(CourierApplicationPage)),
      key: "r-apply-courier"
    }),
    h(Route, {
      path: "/orders",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(BuyerOrdersPage))),
      key: "r-orders"
    }),
    h(Route, {
      path: "/reports",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(BuyerReportsPage))),
      key: "r-buyer-reports"
    }),
    h(Route, {
      path: "/rider",
      element: h(RiderGate, null, h(RiderDashboard)),
      key: "r-rider"
    }),
    h(Route, {
      path: "/messages",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(BuyerMessagesPage))),
      key: "r-messages"
    }),
    h(Route, {
      path: "/notifications",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(BuyerNotificationsPage))),
      key: "r-notif"
    }),
    h(Route, {
      path: "/payment/success",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(PaymentSuccessPage))),
      key: "r-pay-ok"
    }),
    h(Route, {
      path: "/payment/cancel",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(PaymentCancelPage))),
      key: "r-pay-cancel"
    }),
    h(
      Route,
      { path: "/vendor", element: h(VendorGate, null, h(VendorShell)), key: "r-vendor" },
      h(Route, { index: true, element: h(Navigate, { to: "dashboard", replace: true }), key: "r-v-idx" }),
      h(Route, { path: "dashboard", element: h(VendorDashboardPage), key: "r-v-dash" }),
      h(Route, { path: "onboarding", element: h(VendorOnboardingPage), key: "r-v-onboard" }),
      h(Route, { path: "service-inquiries", element: h(VendorServiceInquiriesPage), key: "r-v-svc-req" }),
      h(Route, { path: "stores/:storeKey/menu", element: h(VendorStoreMenuPage), key: "r-v-store-menu" }),
      h(Route, { path: "products", element: h(VendorProductsPage), key: "r-v-products" }),
      h(Route, { path: "products/new", element: h(VendorAddProductPage), key: "r-v-new" }),
      h(Route, { path: "products/:productId", element: h(VendorEditProductPage), key: "r-v-edit" }),
      h(Route, { path: "orders", element: h(VendorOrdersPage), key: "r-v-orders" }),
      h(Route, { path: "messages", element: h(VendorMessagesPage), key: "r-v-messages" }),
      h(Route, { path: "notifications", element: h(VendorNotificationsPage), key: "r-v-notif" }),
      h(Route, { path: "reports", element: h(VendorReportsPage), key: "r-v-reports" }),
      h(Route, { path: "analytics", element: h(VendorAnalyticsPage), key: "r-v-analytics" }),
      h(Route, { path: "reviews", element: h(VendorReviewsPage), key: "r-v-reviews" }),
      h(Route, { path: "settings", element: h(VendorSettingsPage), key: "r-v-settings" }),
      h(Route, { path: "profile", element: h(VendorProfilePage), key: "r-v-profile" })
    ),
    h(Route, { path: "*", element: h(Navigate, { to: "/", replace: true }), key: "r-fallback" })
  );
}

export default function App() {
  return h(
    ThemeProvider,
    null,
    h(
      AuthProvider,
      null,
      h(
        SavedProductsProvider,
        null,
        h(
          CartProvider,
          null,
          h(
            NotificationProvider,
            null,
            h(
              NoticeProvider,
              null,
              h(BrowserRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(AppRoutes))
            )
          )
        )
      )
    )
  );
}
