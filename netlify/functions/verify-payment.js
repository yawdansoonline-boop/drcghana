// netlify/functions/verify-payment.js
//
// This runs on Netlify's server, NOT in the customer's browser.
// It is the only place that knows your Paystack SECRET key.
//
// What it does:
// 1. Receives a payment reference (e.g. ?ref=DRCGHANA_123456789)
// 2. Asks Paystack directly: "was this reference a real, successful payment?"
// 3. Reads back the list of products claimed in metadata, and independently
//    recalculates what that list SHOULD have cost from products.json (the
//    same file the storefront uses) — then checks it matches what was
//    actually paid. This is what stops someone from paying a small amount
//    while claiming an expensive bundle.
// 4. Returns verified info to download.html only if both checks pass.
//
// NOTE: this reads ../../products.json — the single product list at your
// repo root. Update prices there and both the storefront AND this check
// stay in sync automatically. No second file to remember.
//
// LOGGING: console.log/error calls here show up in Netlify under
// Site -> Logs -> Functions -> verify-payment. Useful for debugging a
// stuck payment. Consider trimming these once things are stable so logs
// don't fill up with noise (and don't log secretKey itself).

const catalog = require('../../products.json');

exports.handler = async function (event) {
  console.log('verify-payment started');

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    console.log('Rejected: non-GET method:', event.httpMethod);
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ref = event.queryStringParameters && event.queryStringParameters.ref;
  console.log('Reference:', ref);

  if (!ref) {
    console.log('Rejected: missing reference');
    return {
      statusCode: 400,
      body: JSON.stringify({ verified: false, error: 'Missing transaction reference' }),
    };
  }

  let secretKey = process.env.PAYSTACK_SECRET_KEY;
  console.log('Secret key exists:', !!secretKey);
  if (secretKey) {
    // Safe to log: length and prefix only, never the full key.
    console.log('Secret key length:', secretKey.length);
    console.log('Secret key prefix:', secretKey.substring(0, 4));
    console.log('Secret key has leading/trailing whitespace:', secretKey !== secretKey.trim());
    secretKey = secretKey.trim();
    if (!secretKey.startsWith('sk_')) {
      console.log('WARNING: key does not start with "sk_" — this may be the wrong key type (e.g. a publishable pk_ key, or a value with stray quotes)');
    }
  }

  if (!secretKey) {
    // This means you forgot to set the environment variable in Netlify
    console.error('Server misconfigured: PAYSTACK_SECRET_KEY not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ verified: false, error: 'Server misconfigured: missing secret key' }),
    };
  }

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    console.log('Paystack HTTP status:', paystackRes.status);

    const result = await paystackRes.json();
    console.log('Paystack response:', JSON.stringify(result));

    // Paystack returns status:false at the top level if the ref doesn't exist at all
    if (!result.status || !result.data) {
      console.log('Rejected: transaction not found for ref', ref);
      return {
        statusCode: 404,
        body: JSON.stringify({ verified: false, error: 'Transaction not found' }),
      };
    }

    const tx = result.data;
    console.log('Transaction status:', tx.status, '| amount (pesewas):', tx.amount);

    // The actual check that matters: did the payment succeed?
    if (tx.status !== 'success') {
      console.log('Rejected: payment not successful, status =', tx.status);
      return {
        statusCode: 402,
        body: JSON.stringify({ verified: false, error: 'Payment was not successful', status: tx.status }),
      };
    }

    // Pull the product list back out of the metadata Paystack stored
    // at the time payment was initiated (set in your index.html checkout code)
    const customFields = (tx.metadata && tx.metadata.custom_fields) || [];
    const productsField = customFields.find((f) => f.variable_name === 'products');
    const products = productsField ? productsField.value : '';
    console.log('Raw products field from metadata:', products);

    const itemNames = products ? products.split('|').map((s) => s.trim()).filter(Boolean) : [];
    console.log('Parsed item names:', itemNames);

    if (itemNames.length === 0) {
      console.log('Rejected: no products found on this order');
      return {
        statusCode: 402,
        body: JSON.stringify({ verified: false, error: 'No products found on this order' }),
      };
    }

    // Independently recalculate what this order SHOULD cost, from our own
    // price list — never trust the amount the browser sent to Paystack.
    let expectedTotalGHS = 0;
    for (const name of itemNames) {
      const match = catalog.find((p) => p.name === name);
      if (!match) {
        // Unknown product name — either a typo or someone crafting fake metadata.
        console.log('Rejected: unrecognized product name:', name);
        return {
          statusCode: 402,
          body: JSON.stringify({ verified: false, error: `Unrecognized product: ${name}` }),
        };
      }
      expectedTotalGHS += match.price;
    }

    const expectedTotalPesewas = Math.round(expectedTotalGHS * 100);
    console.log('Expected total (pesewas):', expectedTotalPesewas, '| Actual paid (pesewas):', tx.amount);

    if (tx.amount !== expectedTotalPesewas) {
      // This is the case that matters: someone paid a different amount
      // than what the claimed products actually cost. Flag it, don't fulfil it.
      console.log('Rejected: amount mismatch — expected', expectedTotalPesewas, 'got', tx.amount);
      return {
        statusCode: 402,
        body: JSON.stringify({
          verified: false,
          error: 'Amount paid does not match the order — flagged for manual review',
        }),
      };
    }

    console.log('Verified OK for ref:', tx.reference);

    return {
      statusCode: 200,
      body: JSON.stringify({
        verified: true,
        reference: tx.reference,
        amountPaid: tx.amount / 100, // Paystack amounts are in pesewas
        email: tx.customer ? tx.customer.email : '',
        products, // pipe-separated product names, exactly like before
      }),
    };
  } catch (err) {
    console.error('Verification failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ verified: false, error: err.message }),
    };
  }
};