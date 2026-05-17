'use strict';

const Vertical = require('../models/Vertical');
const BaseRepository = require('./BaseRepository');

class VerticalRepository extends BaseRepository {
    constructor() {
        super(Vertical);
    }

    /**
     * Return all verticals ordered by sortOrder ascending.
     */
    findAll() {
        return this.find({}, { sort: { sortOrder: 1 } });
    }

    /**
     * Find a vertical by its string id field.
     * @param {string} id  e.g. 'uae', 'auction'
     */
    findById(id, opts = {}) {
        return this.findOne({ id }, opts);
    }
}

module.exports = VerticalRepository;
