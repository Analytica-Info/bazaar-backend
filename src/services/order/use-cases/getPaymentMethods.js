'use strict';

module.exports = async function getPaymentMethods() {
    const methods = [];

    if (process.env.TABBY_AUTH_KEY) {
        methods.push({
            id: 'tabby',
            name: 'Tabby',
            icon: 'assets/icons/tabby-logo.png',
            enabled: true,
        });
    }

    methods.push({
        id: 'stripe',
        name: 'Card',
        icon: 'assets/icons/online-payment.png',
        enabled: true,
    });

    // Nomod is gated behind NOMOD_ENABLED=true — not yet exposed to clients
    if (process.env.NOMOD_ENABLED === 'true' && process.env.NOMOD_API_KEY) {
        methods.push({
            id: 'nomod',
            name: 'Nomod',
            icon: 'assets/icons/nomod-logo.png',
            enabled: true,
        });
    }

    return methods;
};
