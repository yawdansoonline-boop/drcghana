// netlify/functions/utils/mailer.js
//
// Sends the "here's your access link" email via Gmail SMTP using Nodemailer.
// Requires GMAIL_USER and GMAIL_APP_PASSWORD to be set as Netlify environment
// variables (never hardcode them here).
//
// `products` here is an array of raw entries straight from products.json
// (the same objects verify-payment.js already matched by name), so no
// second product-mapping list needs to be kept in sync anywhere.
//   - Tool products (e.g. the Block Calculator) should have `accessUrl` set.
//   - Normal file products use `downloadUrl`.
//   - Products with NEITHER (not ready yet) show a "we'll notify you"
//     message instead of a dead button — see resolveAccess() below.

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Returns either { ready: true, url, label } or { ready: false }
function resolveAccess(product) {
  if (product.accessUrl) {
    return { ready: true, url: product.accessUrl, label: 'Open Tool' };
  }
  if (product.downloadUrl) {
    return { ready: true, url: product.downloadUrl, label: 'Download' };
  }
  return { ready: false };
}

function buildEmailHtml(products, reference) {
  const rows = products
    .map((p) => {
      const access = resolveAccess(p);

      const actionHtml = access.ready
        ? (() => {
            const fullUrl = access.url.startsWith('http') ? access.url : `https://drcghana.org${access.url}`;
            return `<a href="${fullUrl}" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#0a5c36;color:#fff;text-decoration:none;border-radius:4px;">${access.label}</a>`;
          })()
        : `<div style="margin-top:8px;padding:8px 16px;background:#fdf5e6;color:#8a6d1a;border:1px solid #e8c96a;border-radius:4px;font-size:13px;display:inline-block;">
             We're finalizing this file — we'll email you directly as soon as it's ready.
           </div>`;

      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong>${p.name}</strong><br/>
          <span style="color:#555;font-size:14px;">${p.desc || ''}</span><br/>
          ${actionHtml}
        </td>
      </tr>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#0a5c36;">Thanks for your purchase — DRCGHANA</h2>
      <p>Your payment (ref: <strong>${reference}</strong>) has been confirmed. Here's access to what you bought:</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin-top:24px;font-size:13px;color:#888;">
        Bookmark these links for future use. If you have any issues, just reply to this email.
      </p>
    </div>`;
}

async function sendAccessEmail(toEmail, products, reference) {
  const html = buildEmailHtml(products, reference);
  const subject =
    products.length === 1
      ? `Your ${products[0].name} is ready`
      : `Your DRCGHANA purchase is ready (${products.length} items)`;

  await transporter.sendMail({
    from: `"DRCGHANA" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    html,
  });
}

module.exports = { sendAccessEmail };