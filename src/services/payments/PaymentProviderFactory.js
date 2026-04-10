const StripeProvider = require('./StripeProvider');
const NomodProvider = require('./NomodProvider');

/**
 * Payment Provider Factory
 *
 * Returns the correct payment provider instance based on name.
 * To add a new provider: create FooProvider.js extending PaymentProvider,
 * then add it to the switch below.
 *
 * Usage:
 *   const provider = PaymentProviderFactory.create('nomod');
 *   const { id, redirectUrl } = await provider.createCheckout({ ... });
 *
 * Environment variable PAYMENT_PROVIDER can set the default:
 *   PAYMENT_PROVIDER=nomod   (or "stripe")
 */

const providers = {
    stripe: () => new StripeProvider(),
    nomod: () => new NomodProvider(),
};

class PaymentProviderFactory {
    /**
     * Create a payment provider instance.
     * @param {string} [name] — "stripe" | "nomod". Defaults to PAYMENT_PROVIDER env or "stripe".
     * @returns {PaymentProvider}
     */
    static create(name) {
        const providerName = (name || process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();
        const factory = providers[providerName];

        if (!factory) {
            const available = Object.keys(providers).join(', ');
            throw new Error(`Unknown payment provider "${providerName}". Available: ${available}`);
        }

        return factory();
    }

    /**
     * List available provider names.
     * @returns {string[]}
     */
    static available() {
        return Object.keys(providers);
    }
}

module.exports = PaymentProviderFactory;
