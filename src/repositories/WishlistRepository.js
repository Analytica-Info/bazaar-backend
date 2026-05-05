const Wishlist = require('../models/Wishlist');
const BaseRepository = require('./BaseRepository');

class WishlistRepository extends BaseRepository {
    constructor() {
        super(Wishlist);
    }

    findForUser(userId, { lean = true } = {}) {
        const q = this.model.findOne({ user: userId });
        return lean ? q.lean().exec() : q.exec();
    }

    async countItemsForUser(userId) {
        const wl = await this.findForUser(userId);
        return wl ? (wl.items?.length || 0) : 0;
    }
}

module.exports = WishlistRepository;
