import { env } from "../config/env";

function asE164Like(phone: string) {
  return phone.trim().replace(/[^\d+]/g, "");
}

export async function sendSms(to: string, body: string) {
  const toPhone = asE164Like(to);
  if (!toPhone) return;

  if (
    env.SMS_PROVIDER !== "twilio" ||
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_FROM_NUMBER
  ) {
    // eslint-disable-next-line no-console
    console.log("[sms:dev]", { to: toPhone, body });
    return;
  }

  const form = new URLSearchParams();
  form.set("To", toPhone);
  form.set("From", env.TWILIO_FROM_NUMBER);
  form.set("Body", body);

  const basic = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMS send failed (${res.status}): ${text.slice(0, 200)}`);
  }
}
