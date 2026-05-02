'use strict';
/**
 * Factory helpers for building Mongoose-shape test fixtures.
 * Each function returns a plain object suitable for Model.create() or inline use.
 * Pass an overrides object to change any field.
 */

const mongoose = require('mongoose');

function buildUser(overrides = {}) {
  return {
    name: 'Test User',
    email: `user-${Date.now()}@test.com`,
    phone: '0501234567',
    password: 'hashedpassword',
    address: [],
    ...overrides,
  };
}

function buildAddress(overrides = {}) {
  return {
    name: 'Home',
    city: 'Dubai',
    area: 'Marina',
    floorNo: '3',
    apartmentNo: '301',
    landmark: 'Near Mall',
    buildingName: 'Tower A',
    mobile: '0501234567',
    state: 'Dubai',
    country: 'AE',
    isPrimary: true,
    ...overrides,
  };
}

function buildProduct(overrides = {}) {
  const id = overrides.product?.id || `prod-${Date.now()}`;
  return {
    product: {
      id,
      name: 'Test Widget',
      description: 'A test widget',
      product_type_id: 'cat-type-001',
      images: [{ url: 'http://img.test/1.jpg' }],
      sku_number: `SKU-${id}`,
      ...(overrides.product || {}),
    },
    variantsData: overrides.variantsData || [{ id: `var-${id}`, qty: 10, name: 'Default', sku: `Electronics - ${id}` }],
    totalQty: overrides.totalQty ?? 10,
    status: overrides.status ?? true,
    discount: overrides.discount ?? 20,
    originalPrice: overrides.originalPrice ?? 100,
    discountedPrice: overrides.discountedPrice ?? 80,
    ...overrides,
  };
}

function buildCart(overrides = {}) {
  return {
    items: [],
    ...overrides,
  };
}

function buildCartItem(overrides = {}) {
  return {
    id: `prod-id-${Date.now()}`,
    product_id: new mongoose.Types.ObjectId().toString(),
    name: 'Test Widget',
    price: 50,
    qty: 1,
    variant: 'Default',
    image: 'http://img.test/1.jpg',
    ...overrides,
  };
}

function buildOrder(userId, overrides = {}) {
  const orderNo = overrides.order_no || Math.floor(Math.random() * 90000) + 10000;
  return {
    userId,
    order_id: `BZR-${orderNo}`,
    order_no: orderNo,
    name: 'Test User',
    address: 'Dubai Marina',
    email: 'user@test.com',
    status: 'Confirmed',
    amount_subtotal: '100.00',
    amount_total: '130.00',
    discount_amount: '0.00',
    shipping: '30.00',
    txn_id: `txn_${Date.now()}`,
    payment_method: 'card',
    payment_status: 'paid',
    orderfrom: 'Website',
    ...overrides,
  };
}

function buildOrderDetail(orderId, overrides = {}) {
  return {
    order_id: orderId,
    product_id: `prod-${Date.now()}`,
    productId: new mongoose.Types.ObjectId().toString(),
    product_name: 'Test Widget',
    product_image: 'http://img.test/1.jpg',
    variant_name: 'Default',
    amount: 50,
    quantity: 1,
    ...overrides,
  };
}

/**
 * Build a Tabby payment payload (as returned by Tabby API).
 */
function buildTabbyPayment(overrides = {}) {
  return {
    id: `pay_tabby_${Date.now()}`,
    status: 'CLOSED',
    amount: '100.00',
    buyer: { name: 'Test Buyer', email: 'buyer@test.com', phone: '0501234567' },
    shipping_address: { address: 'Dubai Marina', city: 'Dubai', zip: '' },
    order: {
      discount_amount: '0.00',
      shipping_amount: '30',
      tax_amount: '0',
      reference_id: `ref-${Date.now()}`,
      items: [],
    },
    meta: {
      cartDataId: null,
      name: 'Test Buyer',
      phone: '0501234567',
      address: 'Dubai Marina',
      city: 'Dubai',
      area: 'Marina',
      buildingName: 'Tower A',
      floorNo: '3',
      apartmentNo: '301',
      landmark: '',
      subtotalAmount: '100',
      shippingCost: '30',
      currency: 'AED',
      couponCode: '',
      mobileNumber: '',
      paymentMethod: 'tabby',
      discountPercent: '0',
      saved_total: '0',
      bankPromoId: '',
    },
    ...overrides,
  };
}

module.exports = { buildUser, buildAddress, buildProduct, buildCart, buildCartItem, buildOrder, buildOrderDetail, buildTabbyPayment };
