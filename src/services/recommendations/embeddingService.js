'use strict';

/**
 * Phase 2 — embedding generation + similarity helpers.
 *
 * Uses OpenAI text-embedding-3-small (1536 dims). The job batches up to
 * EMBED_BATCH products per API call. Set OPENAI_API_KEY to enable; without
 * it the job logs and exits cleanly so the rest of the system keeps working.
 *
 * Add `openai` to package.json before enabling:
 *   npm install openai@^4
 */

const crypto = require('crypto');
const repos = require('../../repositories');
const logger = require('../../utilities/logger');

const MODEL = process.env.RECS_EMBED_MODEL || 'text-embedding-3-small';
const BATCH = Number(process.env.RECS_EMBED_BATCH || 64);
const MAX_PRODUCTS = Number(process.env.RECS_EMBED_MAX_PRODUCTS || 50_000);

function hash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function buildText(product) {
    const inner = product.product || {};
    const parts = [
        inner.name,
        inner.description,
        Array.isArray(inner.categories) ? inner.categories.join(' ') : inner.category,
        inner.brand,
    ].filter(Boolean);
    return parts.join('\n');
}

async function getOpenAI() {
    if (!process.env.OPENAI_API_KEY) return null;
    let OpenAI;
    try {
        OpenAI = require('openai');
    } catch (err) {
        logger.warn({ module: 'recs-embed', err }, 'openai package not installed');
        return null;
    }
    return new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY });
}

async function embedTexts(client, texts) {
    const res = await client.embeddings.create({ model: MODEL, input: texts });
    return res.data.map((d) => d.embedding);
}

async function runEmbeddingJob({ onlyMissing = true } = {}) {
    const client = await getOpenAI();
    if (!client) {
        logger.warn({ module: 'recs-embed' }, 'OPENAI_API_KEY missing — skipping job');
        return { embedded: 0 };
    }
    const Product = repos.products.rawModel();
    const cursor = Product.find({}).limit(MAX_PRODUCTS).lean().cursor();

    let queue = [];
    let embedded = 0;

    async function flush() {
        if (!queue.length) return;
        const texts = queue.map((q) => q.text);
        const vectors = await embedTexts(client, texts);
        await Promise.all(
            queue.map((q, i) =>
                repos.productEmbeddings.upsert({
                    productId: q.productId,
                    model: MODEL,
                    embedding: vectors[i],
                    contentHash: q.contentHash,
                    category: q.category,
                    embeddedAt: new Date(),
                })
            )
        );
        embedded += queue.length;
        queue = [];
    }

    for await (const product of cursor) {
        const text = buildText(product);
        if (!text) continue;
        const ch = hash(`${MODEL}:${text}`);
        if (onlyMissing) {
            const existing = await repos.productEmbeddings.findByProductId(product._id);
            if (existing && existing.contentHash === ch) continue;
        }
        queue.push({
            productId: product._id,
            text,
            contentHash: ch,
            category: product?.product?.categories?.[0] || null,
        });
        if (queue.length >= BATCH) await flush();
    }
    await flush();

    logger.info({ module: 'recs-embed', embedded, model: MODEL }, 'Embedding job complete');
    return { embedded };
}

function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { runEmbeddingJob, cosine, MODEL };
