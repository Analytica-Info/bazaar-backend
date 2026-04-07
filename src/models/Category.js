const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
    side_bar_categories: { type: Array, required: true },
    search_categoriesList: { type: Array, required: true },
}, { timestamps: true });


const Category = mongoose.model('Category', CategorySchema);

module.exports = Category;