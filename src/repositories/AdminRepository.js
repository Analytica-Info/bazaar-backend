/**
 * AdminRepository — owns all Mongoose access for the Admin model.
 */
const Admin = require('../models/Admin');
const BaseRepository = require('./BaseRepository');

class AdminRepository extends BaseRepository {
    constructor() {
        super(Admin);
    }

    /**
     * Lean fetch with the projection used by the notification activity logger.
     */
    findForActivityLog(adminId) {
        return this.model.findById(adminId).select('firstName lastName email').lean();
    }
}

module.exports = AdminRepository;
