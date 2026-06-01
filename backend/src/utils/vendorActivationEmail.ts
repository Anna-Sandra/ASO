export const VENDOR_ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildVendorActivationEmailHtml(opts: {
  fullName: string;
  shopName: string;
  activationUrl: string;
}): string {
  const name = escapeHtml(opts.fullName.trim() || "there");
  const shop = escapeHtml(opts.shopName.trim());
  const url = escapeHtml(opts.activationUrl);
  return `
<p>Hello ${name},</p>
<p>Your shop <strong>${shop}</strong> has been approved on SHOPIQGH.</p>
<p>Click the button below to create your password and activate your vendor account:</p>
<p><a href="${url}" style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Activate My Vendor Account</a></p>
<p>Or copy this link: <a href="${url}">${url}</a></p>
<p>This link expires in 7 days.</p>
<p>If you did not apply, you can ignore this email.</p>
`.trim();
}

export function buildVendorApplicationReceivedEmailHtml(opts: {
  fullName: string;
  shopName: string;
  registerUrl: string;
  loginUrl: string;
}): string {
  const name = escapeHtml(opts.fullName.trim() || "there");
  const shop = escapeHtml(opts.shopName.trim());
  const registerUrl = escapeHtml(opts.registerUrl);
  const loginUrl = escapeHtml(opts.loginUrl);
  return `
<p>Hello ${name},</p>
<p>We received your vendor application for <strong>${shop}</strong> on SHOPIQGH.</p>
<p>Our team will review it and email you when there is a decision. Use the <strong>same email address</strong> you used on the form for any account you create.</p>
<p>Optional: create a shopper account now so approval is faster after we review your application:</p>
<p><a href="${registerUrl}" style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Create account</a></p>
<p>Already have an account? <a href="${loginUrl}">Sign in</a></p>
<p>If you are approved and did not register beforehand, we will send a separate email with a link to set your password and open your vendor dashboard.</p>
`.trim();
}

export function buildVendorApprovedExistingAccountEmailHtml(opts: {
  fullName: string;
  shopName: string;
  signInUrl: string;
}): string {
  const name = escapeHtml(opts.fullName.trim() || "there");
  const shop = escapeHtml(opts.shopName.trim());
  const url = escapeHtml(opts.signInUrl);
  return `
<p>Hello ${name},</p>
<p>Your shop <strong>${shop}</strong> has been approved on SHOPIQGH.</p>
<p>Your account is now a <strong>vendor (seller)</strong>. Sign in with the same email and password you used when you applied:</p>
<p><a href="${url}" style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Sign in to your vendor dashboard</a></p>
<p>Or open: <a href="${url}">${url}</a></p>
`.trim();
}
