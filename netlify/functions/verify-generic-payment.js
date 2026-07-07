// netlify/functions/verify-generic-payment.js
//
// Same verify-before-trust pattern as verify-payment.js, but for the
// generic "Make a Payment" page (registration fees, consultations,
// donations, etc). There's no fixed product catalog to cross-check
// against here — the customer picks their own amount — so this function's
// job is simpler: confirm with Paystack directly that the payment actually
// succeeded, instead of trusting the browser's popup callback alone.

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ref = event.queryStringParameters && event.queryStringParameters.ref;

  if (!ref) {
    return { statusCode: 400, body: JSON.stringify({ verified: false, error: 'Missing transaction reference' }) };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, body: JSON.stringify({ verified: false, error: 'Server misconfigured: missing secret key' }) };
  }

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const result = await paystackRes.json();

    if (!result.status || !result.data) {
      return { statusCode: 404, body: JSON.stringify({ verified: false, error: 'Transaction not found' }) };
    }

    const tx = result.data;

    if (tx.status !== 'success' || !tx.amount || tx.amount <= 0) {
      return {
        statusCode: 402,
        body: JSON.stringify({ verified: false, error: 'Payment was not successful', status: tx.status }),
      };
    }

    const customFields = (tx.metadata && tx.metadata.custom_fields) || [];
    const getField = (name) => {
      const f = customFields.find((c) => c.variable_name === name);
      return f ? f.value : '';
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        verified: true,
        reference: tx.reference,
        amount: tx.amount / 100,
        email: tx.customer ? tx.customer.email : '',
        name: getField('full_name'),
        service: getField('service'),
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ verified: false, error: 'Verification request failed' }) };
  }
};