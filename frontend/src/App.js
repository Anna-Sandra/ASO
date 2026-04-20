import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { CartProvider } from "./CartContext";
import { NoticeProvider } from "./NoticeContext";
import { ThemeProvider } from "./ThemeContext";
import { h, f } from "./h";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage
} from "./screensAuth";
import {
  BuyerMessagesPage,
  BuyerOrdersPage,
  CheckoutPage,
  PaymentCancelPage,
  PaymentSuccessPage,
  ProductDetailPage,
  ProfilePage,
  ShopPage
} from "./screensBuyer";
import {
  VendorAddProductPage,
  VendorAnalyticsPage,
  VendorDashboardPage,
  VendorEditProductPage,
  VendorMessagesPage,
  VendorOrdersPage,
  VendorProductsPage,
  VendorProfilePage,
  VendorReviewsPage,
  VendorSettingsPage,
  VendorShell
} from "./screensVendor";

function VendorGate({ children }) {
  const { accessToken, loading, user } = useAuth();
  if (loading) {
    return h(
      "div",
      { className: "flex min-h-screen items-center justify-center bg-night-950 text-slate-300" },
      "Loading…"
    );
  }
  if (!accessToken) {
    return h(Navigate, { to: "/login", replace: true, state: { from: "vendor" } });
  }
  if (user && user.role && user.role !== "seller") {
    return h(Navigate, { to: "/login", replace: true, state: { from: "vendor" } });
  }
  return children;
}

function BuyerGate({ children }) {
  const { accessToken, loading, user } = useAuth();
  if (loading) {
    return h(
      "div",
      { className: "flex min-h-screen items-center justify-center bg-night-950 text-slate-300" },
      "Loading…"
    );
  }
  if (accessToken && user?.role === "seller") {
    return h(Navigate, { to: "/vendor/dashboard", replace: true });
  }
  return children;
}

/** Buyer routes that need an account (checkout, profile, payment). */
function RequireBuyerAuth({ children }) {
  const { accessToken, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return h(
      "div",
      { className: "flex min-h-screen items-center justify-center bg-night-950 text-slate-300" },
      "Loading…"
    );
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
    h(Route, {
      path: "/products/:productId",
      element: h(BuyerGate, null, h(ProductDetailPage)),
      key: "r-product"
    }),
    h(Route, { path: "/login", element: h(LoginPage), key: "r-login" }),
    h(Route, { path: "/register", element: h(RegisterPage), key: "r-register" }),
    h(Route, { path: "/verify-email", element: h(VerifyEmailPage), key: "r-verify" }),
    h(Route, { path: "/forgot-password", element: h(ForgotPasswordPage), key: "r-forgot" }),
    h(Route, { path: "/reset-password", element: h(ResetPasswordPage), key: "r-reset" }),
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
      path: "/orders",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(BuyerOrdersPage))),
      key: "r-orders"
    }),
    h(Route, {
      path: "/messages",
      element: h(BuyerGate, null, h(RequireBuyerAuth, null, h(BuyerMessagesPage))),
      key: "r-messages"
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
      h(Route, { path: "products", element: h(VendorProductsPage), key: "r-v-products" }),
      h(Route, { path: "products/new", element: h(VendorAddProductPage), key: "r-v-new" }),
      h(Route, { path: "products/:productId", element: h(VendorEditProductPage), key: "r-v-edit" }),
      h(Route, { path: "orders", element: h(VendorOrdersPage), key: "r-v-orders" }),
      h(Route, { path: "messages", element: h(VendorMessagesPage), key: "r-v-messages" }),
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
        CartProvider,
        null,
        h(
          NoticeProvider,
          null,
          h(BrowserRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(AppRoutes))
        )
      )
    )
  );
}
