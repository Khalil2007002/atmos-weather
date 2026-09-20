const resendEndpoint = 'https://api.resend.com/emails';

export class EmailConfigurationError extends Error {
  constructor() {
    super('Le service email n’est pas configuré.');
    this.name = 'EmailConfigurationError';
  }
}

export function isEmailConfigured() {
  return Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM && process.env.EMAIL_FROM_NAME);
}

export async function sendPasswordResetEmail({ to, code }) {
  if (!isEmailConfigured()) throw new EmailConfigurationError();

  const sender = `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`;
  const response = await fetch(resendEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: [to],
      subject: 'Votre code de réinitialisation Atmos Weather',
      text: `Atmos Weather\n\nVotre code de réinitialisation est : ${code}\n\nIl expire dans 10 minutes. Ne partagez jamais ce code. Si vous n’avez pas demandé cette réinitialisation, ignorez cet email.`,
      html: `<div style="font-family:Arial,sans-serif;color:#17213b"><h1>Atmos Weather</h1><p>Votre code de réinitialisation :</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>Il expire dans <strong>10 minutes</strong>.</p><p>Ne partagez jamais ce code. Si vous n’avez pas demandé cette réinitialisation, ignorez cet email.</p></div>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error('Le fournisseur email a refusé l’envoi.');
  }
}
