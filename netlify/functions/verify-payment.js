// netlify/functions/verify-payment.js
//
// This runs on Netlify's server, NOT in the customer's browser.
// It is the only place that knows your Paystack SECRET key.
//
// What it does:
// 1. Receives a payment reference (e.g. ?ref=DRCGHANA_123456789)
// 2. Asks Paystack directly: "was this reference a real, successful payment?"
// 3. Reads back the list of products claimed in metadata, and independently
//    recalculates what that list SHOULD have cost from our own price list —
//    then checks it matches what was actually paid. This is what stops
//    someone from paying a small amount while claiming an expensive bundle.
// 4. Returns verified info to download.html only if both checks pass.

const catalog = require('./products-data.js');

exports.handler = async function (event) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ref = event.queryStringParameters && event.queryStringParameters.ref;

  if (!ref) {
    return {
      statusCode: 400,
      body: JSON.stringify({ verified: false, error: 'Missing transaction reference' }),
    };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    // This means you forgot to set the environment variable in Netlify
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

    const result = await paystackRes.json();

    // Paystack returns status:false at the top level if the ref doesn't exist at all
    if (!result.status || !result.data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ verified: false, error: 'Transaction not found' }),
      };
    }

    const tx = result.data;

    // The actual check that matters: did the payment succeed?
    if (tx.status !== 'success') {
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

    const itemNames = products ? products.split('|').map((s) => s.trim()).filter(Boolean) : [];

    if (itemNames.length === 0) {
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
        return {
          statusCode: 402,
          body: JSON.stringify({ verified: false, error: `Unrecognized product: ${name}` }),
        };
      }
      expectedTotalGHS += match.price;
    }

    const expectedTotalPesewas = Math.round(expectedTotalGHS * 100);

    if (tx.amount !== expectedTotalPesewas) {
      // This is the case that matters: someone paid a different amount
      // than what the claimed products actually cost. Flag it, don't fulfil it.
      return {
        statusCode: 402,
        body: JSON.stringify({
          verified: false,
          error: 'Amount paid does not match the order — flagged for manual review',
        }),
      };
    }

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
    return {
      statusCode: 500,
      body: JSON.stringify({ verified: false, error: 'Verification request failed' }),
    };
  }
};