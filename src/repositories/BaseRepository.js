/**
 * BaseRepository — generic CRUD over a Mongoose model.
 *
 * Conventions:
 *   - Reads default to `.lean()` and return plain objects. Pass `{ lean: false }`
 *     to receive hydrated Mongoose documents (needed when callers must `.save()`
 *     or rely on virtuals/middleware).
 *   - Every write method accepts an optional `{ session }` so callers using
 *     `UnitOfWork.runInTransaction` can thread a Mongoose session through.
 *   - No business logic lives here. Entity-specific repositories extend this
 *     class to add semantic query methods.
 */
class BaseRepository {
    /**
     * @param {import('mongoose').Model} model
     */
    constructor(model) {
        if (!model) throw new Error('BaseRepository requires a Mongoose model');
        this.model = model;
    }

    /**
     * @param {string|import('mongoose').Types.ObjectId} id
     * @param {{ lean?: boolean, projection?: string|object, session?: any }} [opts]
     */
    async findById(id, opts = {}) {
        const { lean = true, projection, session } = opts;
        let q = this.model.findById(id, projection);
        if (session) q = q.session(session);
        if (lean) q = q.lean();
        return q.exec();
    }

    /**
     * @param {object} filter
     * @param {{ lean?: boolean, projection?: string|object, session?: any }} [opts]
     */
    async findOne(filter, opts = {}) {
        const { lean = true, projection, session } = opts;
        let q = this.model.findOne(filter, projection);
        if (session) q = q.session(session);
        if (lean) q = q.lean();
        return q.exec();
    }

    /**
     * @param {object} filter
     * @param {{ lean?: boolean, projection?: string|object, sort?: object, skip?: number, limit?: number, session?: any }} [opts]
     */
    async find(filter = {}, opts = {}) {
        const { lean = true, projection, sort, skip, limit, session } = opts;
        let q = this.model.find(filter, projection);
        if (sort) q = q.sort(sort);
        if (typeof skip === 'number') q = q.skip(skip);
        if (typeof limit === 'number') q = q.limit(limit);
        if (session) q = q.session(session);
        if (lean) q = q.lean();
        return q.exec();
    }

    /**
     * @param {object} filter
     * @param {{ session?: any }} [opts]
     */
    async count(filter = {}, opts = {}) {
        const q = this.model.countDocuments(filter);
        if (opts.session) q.session(opts.session);
        return q.exec();
    }

    /**
     * @param {object} filter
     * @param {{ session?: any }} [opts]
     */
    async exists(filter, opts = {}) {
        const q = this.model.exists(filter);
        if (opts.session) q.session(opts.session);
        return Boolean(await q.exec());
    }

    /**
     * Create a single document.
     * @param {object} data
     * @param {{ session?: any }} [opts]
     */
    async create(data, opts = {}) {
        if (opts.session) {
            const docs = await this.model.create([data], { session: opts.session });
            return docs[0].toObject();
        }
        const doc = await this.model.create(data);
        return doc.toObject();
    }

    /**
     * Update by id, returning the updated document.
     * Runs validators by default — caller must opt out with `{ runValidators: false }`.
     * @param {string|import('mongoose').Types.ObjectId} id
     * @param {object} update
     * @param {{ session?: any, runValidators?: boolean, lean?: boolean }} [opts]
     */
    async updateById(id, update, opts = {}) {
        const { session, runValidators = true, lean = true } = opts;
        let q = this.model.findByIdAndUpdate(id, update, {
            new: true,
            runValidators,
        });
        if (session) q = q.session(session);
        if (lean) q = q.lean();
        return q.exec();
    }

    /**
     * @param {object} filter
     * @param {object} update
     * @param {{ session?: any, runValidators?: boolean }} [opts]
     */
    async updateMany(filter, update, opts = {}) {
        const { session, runValidators = true } = opts;
        const q = this.model.updateMany(filter, update, { runValidators });
        if (session) q.session(session);
        return q.exec();
    }

    /**
     * @param {string|import('mongoose').Types.ObjectId} id
     * @param {{ session?: any }} [opts]
     */
    async deleteById(id, opts = {}) {
        const q = this.model.findByIdAndDelete(id);
        if (opts.session) q.session(opts.session);
        return q.exec();
    }

    /**
     * @param {object} filter
     * @param {{ session?: any }} [opts]
     */
    async deleteMany(filter, opts = {}) {
        const q = this.model.deleteMany(filter);
        if (opts.session) q.session(opts.session);
        return q.exec();
    }

    /**
     * Escape hatch: returns the underlying Mongoose model.
     * Avoid using this from services. Prefer adding a semantic method to the
     * repository instead so the persistence detail stays in one place.
     */
    rawModel() {
        return this.model;
    }
}

module.exports = BaseRepository;
