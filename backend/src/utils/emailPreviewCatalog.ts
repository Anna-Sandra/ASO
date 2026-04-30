/**
 * Static samples for admin UI (not necessarily identical to production HTML in auth controllers).
 */
export const EMAIL_TEMPLATE_PREVIEWS: { id: string; title: string; description: string; sampleHtml: string }[] = [
  {
    id: "verify",
    title: "Email verification (OTP)",
    description: "Sent when a user registers and must verify their address.",
    sampleHtml: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <p>Hi there,</p>
  <p>Use this code to verify your email:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:4px">123456</p>
  <p style="color:#64748b;font-size:13px">This code expires in 15 minutes.</p>
</div>`
  },
  {
    id: "login_otp",
    title: "Sign-in code (OTP)",
    description: "Sent when email OTP login is enabled.",
    sampleHtml: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <p>Your one-time sign-in code:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:4px">847291</p>
  <p style="color:#64748b;font-size:13px">If you didn’t request this, ignore this email.</p>
</div>`
  },
  {
    id: "password_reset",
    title: "Password reset",
    description: "Sent after “Forgot password” with a reset code.",
    sampleHtml: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <p>Reset your password using this code:</p>
  <p style="font-size:24px;font-weight:600">581942</p>
  <p><a href="#">Or use this link</a> (expires soon).</p>
</div>`
  },
  {
    id: "order",
    title: "Order confirmation",
    description: "Buyer receipt after successful checkout.",
    sampleHtml: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <h2 style="margin:0 0 12px">Order confirmed</h2>
  <p>Thank you — your payment was received.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td>Item</td><td align="right">Ghc 12.00</td></tr>
    <tr><td><strong>Total</strong></td><td align="right"><strong>Ghc 12.00</strong></td></tr>
  </table>
</div>`
  },
  {
    id: "vendor_alert",
    title: "Vendor order alert",
    description: "Notifies a seller of a new paid order (when mailer is on).",
    sampleHtml: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <p>You have a <strong>new order</strong> on Campus Mart.</p>
  <p>Open your vendor dashboard to view details and fulfill.</p>
</div>`
  },
  {
    id: "report_ack",
    title: "Report acknowledgement",
    description: "Confirms a user report was received.",
    sampleHtml: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <p>We’ve received your report and will review it.</p>
  <p style="color:#64748b;font-size:13px">Reference: #R-9F2A</p>
</div>`
  }
];
