'use strict';

const path = require("path");
const Order = require('../../../repositories').orders.rawModel();

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.webp'];
const ALLOWED_IMAGE_MIMETYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

module.exports = async function uploadProofOfDelivery(orderId, files, bodyProof) {
    if (!orderId) {
        throw { status: 400, message: 'order_id is required' };
    }

    const order = await Order.findOne({ order_id: orderId }).exec();
    if (!order) {
        throw { status: 404, message: 'Order not found' };
    }

    let proof_of_delivery = [];

    if (files && files.length > 0) {
        const ext = (file) => path.extname(file.originalname || '').toLowerCase();
        const isImage = (file) =>
            ALLOWED_IMAGE_EXTENSIONS.includes(ext(file)) &&
            ALLOWED_IMAGE_MIMETYPES.includes((file.mimetype || '').toLowerCase());
        const invalid = files.find((f) => !isImage(f));
        if (invalid) {
            throw { status: 400, message: 'Only image files are allowed (png, jpeg, jpg, gif, webp).' };
        }
        const BACKEND_URL = process.env.BACKEND_URL || '';
        proof_of_delivery = files.map((file) => `${BACKEND_URL}/uploads/proof-of-delivery/${file.filename}`);
    } else {
        if (bodyProof != null) {
            if (Array.isArray(bodyProof)) proof_of_delivery = bodyProof;
            else if (typeof bodyProof === 'string') {
                try { proof_of_delivery = JSON.parse(bodyProof); } catch { proof_of_delivery = [bodyProof]; }
            } else proof_of_delivery = [];
        }
    }

    if (proof_of_delivery.length === 0) {
        throw { status: 400, message: 'At least one proof of delivery image or URL is required.' };
    }

    const previousImages = order.proof_of_delivery || [];
    order.proof_of_delivery = proof_of_delivery;
    await order.save();

    const message = previousImages.length > 0
        ? 'Proof of delivery updated (replaced previous images).'
        : 'Proof of delivery saved.';

    return {
        message,
        order_id: order.order_id,
        proof_of_delivery: order.proof_of_delivery,
    };
};
