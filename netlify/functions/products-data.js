// netlify/functions/products-data.js
//
// IMPORTANT: This must stay in sync with the `products` array in index.html.
// This is the server's own copy of prices — used ONLY to independently
// recalculate what a purchase should cost, so we can catch anyone who
// tampers with the amount sent to Paystack while keeping the product
// list in metadata unchanged.
//
// Whenever you add a product or change a price in index.html, make the
// same change here. (The full database version we discussed avoids this
// duplication entirely — worth moving to if this list grows much further.)

module.exports = [
  { name: '3D 3-Bedroom House', price: 59 },
  { name: '5-Bedroom Executive House', price: 1200 },
  { name: 'Office Complex Design', price: 2400 },
  { name: 'Retail Shopfront Design', price: 480 },
  { name: 'Foundation Structural Set', price: 320 },
  { name: 'RC Frame Structural Package', price: 750 },
  { name: 'BOQ Excel Master Template', price: 180 },
  { name: '2-Bedroom Apartment Block', price: 880 },
  { name: 'Warehouse / Store Design', price: 950 },
  { name: 'Steel Connection Details', price: 250 },
  { name: 'Site Planning Template', price: 140 },
  { name: '4-Bedroom Townhouse', price: 980 },
];