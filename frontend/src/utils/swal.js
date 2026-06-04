import Swal from "sweetalert2";
import { sanitizeErrorMessage } from "utils/userFacingError";

const BRAND_CONFIRM = "#7c3aed";

const compactCard = Swal.mixin({
  width: "18rem",
  padding: "0.75rem 1rem",
  buttonsStyling: false,
  heightAuto: false,
  backdrop: "rgba(15, 23, 42, 0.35)",
  customClass: {
    container: "shopiqgh-swal-container",
    popup: "shopiqgh-swal-popup",
    title: "shopiqgh-swal-title",
    htmlContainer: "shopiqgh-swal-text",
    icon: "shopiqgh-swal-icon",
    actions: "shopiqgh-swal-actions",
    confirmButton: "shopiqgh-swal-btn",
    cancelButton: "shopiqgh-swal-btn shopiqgh-swal-btn--muted"
  }
});

const errorToast = Swal.mixin({
  toast: true,
  position: "top",
  icon: "error",
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true,
  customClass: {
    popup: "shopiqgh-swal-toast"
  },
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  }
});

function prepareErrorText(message) {
  const m = String(message ?? "").trim();
  return sanitizeErrorMessage(m, m || "Something went wrong. Please try again.");
}

/** Compact modal error (replaces large default SweetAlert). */
export function swalError(message, opts = {}) {
  const text = prepareErrorText(message);
  const title = opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : "Something went wrong";
  return compactCard.fire({
    icon: "error",
    title,
    text,
    confirmButtonText: opts.confirmButtonText || opts.okLabel || "OK"
  });
}

/** Short-lived error toast. */
export function swalErrorToast(message) {
  const title = prepareErrorText(message);
  return errorToast.fire({ title });
}

export function swalWarning(message, opts = {}) {
  const text = prepareErrorText(message);
  return compactCard.fire({
    icon: "warning",
    title: opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : "Please check",
    text,
    confirmButtonText: opts.confirmButtonText || opts.okLabel || "OK"
  });
}

export function swalConfirm(message, opts = {}) {
  const text = prepareErrorText(message);
  return compactCard
    .fire({
      icon: "warning",
      title: opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : "Just checking",
      text,
      showCancelButton: true,
      confirmButtonText: opts.confirmButtonText || opts.confirmLabel || "OK",
      cancelButtonText: opts.cancelButtonText || opts.cancelLabel || "Cancel",
      reverseButtons: true
    })
    .then((r) => Boolean(r.isConfirmed));
}

export function swalSuccess(message, opts = {}) {
  return compactCard.fire({
    icon: "success",
    title: opts.title || "Done",
    text: String(message ?? "").trim(),
    confirmButtonText: opts.okLabel || "OK"
  });
}

export function swalInfo(message, opts = {}) {
  return compactCard.fire({
    icon: "info",
    title: opts.title || "Notice",
    text: String(message ?? "").trim(),
    confirmButtonText: opts.okLabel || "OK"
  });
}
