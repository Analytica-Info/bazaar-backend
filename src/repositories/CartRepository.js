const Cart = require('../models/Cart');
const BaseRepository = require('./BaseRepository');

class CartRepository extends BaseRepository {
    constructor() { super(Cart); }
}

module.exports = CartRepository;
