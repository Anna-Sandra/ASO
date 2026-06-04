import Swal from "sweetalert2";
import { sanitizeErrorMessage } from "utils/userFacingError";

const BRAND_CONFIRM = "#7c3aed";

const errorToast = Swal.mixin({
  toast: true,
  position: "top",
  icon: "error",
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  }
});

function prepareErrorText(message) {
  const m = String(message ?? "").trim();
  return sanitizeErrorMessage(m, m || "Something went wrong. Please try again.");
}

/** Modal error (replaces custom alert / inline error banners). */
export function swalError(message, opts = {}) {
  const text = prepareErrorText(message);
  const title = opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : "Something went wrong";
  return Swal.fire({
    icon: "error",
    title,
    text,
    confirmButtonText: opts.confirmButtonText || opts.okLabel || "OK",
    confirmButtonColor: BRAND_CONFIRM,
    buttonsStyling: true,
    heightAuto: false
  });
}

/** Short-lived error toast. */
export function swalErrorToast(message) {
  const title = prepareErrorText(message);
  return errorToast.fire({ title });
}

export function swalWarning(message, opts = {}) {
  const text = prepareErrorText(message);
  return Swal.fire({
    icon: "warning",
    title: opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : "Please check",
    text,
    confirmButtonText: opts.confirmButtonText || opts.okLabel || "OK",
    confirmButtonColor: BRAND_CONFIRM,
    heightAuto: false
  });
}

export function swalConfirm(message, opts = {}) {
  const text = prepareErrorText(message);
  return Swal.fire({
    icon: "warning",
    title: opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : "Just checking",
    text,
    showCancelButton: true,
    confirmButtonText: opts.confirmButtonText || opts.confirmLabel || "OK",
    cancelButtonText: opts.cancelButtonText || opts.cancelLabel || "Cancel",
    confirmButtonColor: BRAND_CONFIRM,
    cancelButtonColor: "#64748b",
    reverseButtons: true,
    heightAuto: false
  }).then((r) => Boolean(r.isConfirmed));
}

export function swalSuccess(message, opts = {}) {
  return Swal.fire({
    icon: "success",
    title: opts.title || "Done",
    text: String(message ?? "").trim(),
    confirmButtonText: opts.okLabel || "OK",
    confirmButtonColor: BRAND_CONFIRM,
    heightAuto: false
  });
}

export function swalInfo(message, opts = {}) {
  return Swal.fire({
    icon: "info",
    title: opts.title || "Notice",
    text: String(message ?? "").trim(),
    confirmButtonText: opts.okLabel || "OK",
    confirmButtonColor: BRAND_CONFIRM,
    heightAuto: false
  });
}
