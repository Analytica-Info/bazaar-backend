'use strict';

const mongoose = require('mongoose');

const paymentMethodConfigSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            default: 'singleton',
        },
        stripeEnabled: {
            type: Boolean,
            required: true,
            default: true,
        },
        tabbyEnabled: {
            type: Boolean,
            required: true,
            default: true,
        },
        nomodEnabled: {
            type: Boolean,
            required: true,
            default: false,
        },
        /**
         * Home-screen banner carousel kill-switch (mobile). Default `true` =
         * fail-open — a brand-new singleton or a config-read failure leaves
         * banners visible. Marketing toggles this to `false` via
         * `PUT /v2/admin/payment-method-config` when they need to hide the
         * home carousel without an app release.
         *
         * Mobile reads `data.bannersEnabled` from `GET /v2/config` — see
         * `Bazaar-Mobile-App/lib/core/services/app_version_gate.dart` →
         * `AppVersionGate.remoteBannersEnabled`. Mobile defaults to `true`
         * if the field is absent, so the server default matches.
         *
         * NOTE: this model is named `PaymentMethodConfig` for historical
         * reasons but now also carries non-payment runtime flags.
         * Rename + collection migration deferred until there's a second
         * non-payment flag to justify the churn.
         */
        bannersEnabled: {
            type: Boolean,
            required: true,
            default: true,
        },
        updatedAt: {
            type: Date,
            default: null,
        },
        updatedBy: {
            type: String,
            default: 'system',
        },
    },
    {
        // Disable the default Mongoose _id auto-generation; we supply our own.
        _id: false,
        // Disable the default updatedAt from timestamps — we manage it manually
        // so controllers can attribute changes to a specific admin.
        timestamps: false,
        versionKey: false,
    }
);

const PaymentMethodConfig = mongoose.model('PaymentMethodConfig', paymentMethodConfigSchema, 'paymentMethodConfig');

module.exports = PaymentMethodConfig;
