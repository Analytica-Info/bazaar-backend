const CartData = require('../models/CartData');
const BaseRepository = require('./BaseRepository');

class CartDataRepository extends BaseRepository {
    constructor() { super(CartData); }
}

module.exports = CartDataRepository;
