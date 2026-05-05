'use strict';

// Barrel — re-exports all use-cases so consumers can require('./order') instead of the facade
module.exports = {
    getAddresses: require('./use-cases/getAddresses'),
    storeAddress: require('./use-cases/storeAddress'),
    deleteAddress: require('./use-cases/deleteAddress'),
    setPrimaryAddress: require('./use-cases/setPrimaryAddress'),
    validateInventoryBeforeCheckout: require('./use-cases/validateInventoryBeforeCheckout'),
    getOrders: require('./use-cases/getOrders'),
    initStripePayment: require('./use-cases/initStripePayment'),
    getPaymentMethods: require('./use-cases/getPaymentMethods'),
    getPaymentIntent: require('./use-cases/getPaymentIntent'),
    updateOrderStatus: require('./use-cases/updateOrderStatus'),
    uploadProofOfDelivery: require('./use-cases/uploadProofOfDelivery'),
    markCouponUsed: require('./use-cases/markCouponUsed'),
    createStripeCheckoutSession: require('./use-cases/createStripeCheckoutSession'),
    createTabbyCheckoutSession: require('./use-cases/createTabbyCheckoutSession'),
    verifyTabbyPayment: require('./use-cases/verifyTabbyPayment'),
    createNomodCheckoutSession: require('./use-cases/createNomodCheckoutSession'),
    verifyNomodPayment: require('./use-cases/verifyNomodPayment'),
    handleTabbyWebhook: require('./use-cases/handleTabbyWebhook'),
};
