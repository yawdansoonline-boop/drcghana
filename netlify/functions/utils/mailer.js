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
//
// SPAM NOTE: this now sends BOTH an html and a plain-text version, and the
// html is deliberately plain (no big colored buttons/banners) — heavily
// styled "marketing-looking" HTML from a personal Gmail address is one of
// the most common reasons transactional mail lands in spam.

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

function fullUrl(url) {
  return url.startsWith('http') ? url : `https://drcghana.org${url}`;
}

function buildEmailHtml(products, reference) {
  const rows = products
    .map((p) => {
      const access = resolveAccess(p);
      const actionHtml = access.ready
        ? `<a href="${fullUrl(access.url)}">${access.label} →</a>`
        : `<em>We're finalizing this file — we'll email you directly as soon as it's ready.</em>`;

      return `
        <p style="margin:0 0 4px;"><strong>${p.name}</strong></p>
        <p style="margin:0 0 4px;color:#555;font-size:14px;">${p.desc || ''}</p>
        <p style="margin:0 0 20px;">${actionHtml}</p>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px;">
      <p>Hi,</p>
      <p>Thanks for your purchase from DRCGHANA. Your payment (reference <strong>${reference}</strong>) has been confirmed. Here's your access:</p>
      ${rows}
      <p style="font-size:13px;color:#888;margin-top:24px;">
        Please save this email for future reference. If you have any issues, just reply here or WhatsApp us at 0244 072 436.
      </p>
      <p style="font-size:13px;color:#888;">— DRCGHANA</p>
    </div>`;
}

function buildEmailText(products, reference) {
  const lines = products.map((p) => {
    const access = resolveAccess(p);
    const line = access.ready
      ? `${p.name}: ${fullUrl(access.url)}`
      : `${p.name}: still being finalized — we'll email you when it's ready.`;
    return line;
  });

  return [
    'Hi,',
    '',
    `Thanks for your purchase from DRCGHANA. Your payment (reference ${reference}) has been confirmed.`,
    '',
    'Your access:',
    ...lines,
    '',
    'Please save this email for future reference.',
    'Any issues, reply to this email or WhatsApp us at 0244 072 436.',
    '',
    '— DRCGHANA',
  ].join('\n');
}

async function sendAccessEmail(toEmail, products, reference) {
  const html = buildEmailHtml(products, reference);
  const text = buildEmailText(products, reference);
  const subject =
    products.length === 1
      ? `Your ${products[0].name} is ready`
      : `Your DRCGHANA purchase is ready (${products.length} items)`;

  await transporter.sendMail({
    from: `"DRCGHANA" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text,
    html,
  });
}

module.exports = { sendAccessEmail };