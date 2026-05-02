'use strict';

/**
 * Pure Lightspeed sync domain helpers:
 *  - fixZeroTaxInclusive  — patches product price when tax_inclusive === 0
 *  - currentTime          — Dubai-timezone formatted timestamp
 *  - getMatchingProductIds — parked-product variant lookup
 *
 * All functions are free of I/O to keep them testable in isolation.
 * currentTime uses clock.now() (testable seam) instead of new Date().
 */

const clock = require('../../../../utilities/clock');

/**
 * When Lightspeed parent has tax_inclusive=0 but variants have real prices,
 * patch the product object so frontend displays the correct price.
 */
function fixZeroTaxInclusive(product, variantsData) {
  const taxIncl = parseFloat(product.price_standard?.tax_inclusive) || 0;
  if (taxIncl === 0 && variantsData.length > 0) {
    const firstVariantPrice = parseFloat(variantsData[0].price) || 0;
    if (firstVariantPrice > 0) {
      product.price_standard.tax_inclusive = String(firstVariantPrice);
      product.price_standard.tax_exclusive = (firstVariantPrice / 1.05).toFixed(5);
    }
  }
}

async function currentTime() {
  const date = clock.now();
  const formatter = new Intl.DateTimeFormat('en-AE', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const parts = formatter.formatToParts(date);
  let hour = '', minute = '', second = '', period = '', day = '', month = '', year = '';

  parts.forEach((part) => {
    switch (part.type) {
      case 'hour': hour = part.value; break;
      case 'minute': minute = part.value; break;
      case 'second': second = part.value; break;
      case 'dayPeriod': period = part.value; break;
      case 'day': day = part.value; break;
      case 'month': month = part.value; break;
      case 'year': year = part.value; break;
    }
  });

  return `${hour}:${minute}:${second} ${period.toUpperCase()} - ${day} ${month}, ${year}`;
}

function getMatchingProductIds(updateProductId, allParkedProductIds) {
  const matchingProductIds = [];
  const seenProductIds = new Set();

  for (const item of allParkedProductIds) {
    const variantId = item.product;
    if (variantId === updateProductId) {
      const productId = updateProductId;
      if (!seenProductIds.has(productId)) {
        matchingProductIds.push({
          product: productId,
          qty: Math.floor(item.qty),
        });
        seenProductIds.add(productId);
      }
    }
  }

  return matchingProductIds;
}

module.exports = { fixZeroTaxInclusive, currentTime, getMatchingProductIds };
