'use strict';

const repos = require('../../../repositories');
const clock = require('../../../utilities/clock');

exports.getCurrentMonthOrderCategories = async () => {
  const now = clock.now();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const orders = await repos.orders.findByDateRange(currentMonthStart, currentMonthEnd);

  if (orders.length === 0) {
    return {
      data: [],
      message: 'No orders found for current month',
    };
  }

  const orderIds = orders.map(order => order._id);
  const orderDetails = await repos.orderDetails.findForOrders(orderIds);

  const productIds = [...new Set(orderDetails.map(detail => detail.product_id))];
  const products = await repos.products.findByIds(productIds);

  const productCategoryMap = {};
  products.forEach(product => {
    if (product.product && product.product.id && product.product.product_type_id) {
      productCategoryMap[product._id] = product.product.product_type_id;
    }
  });

  const searchList = await repos.categories.getSearchCategoriesList();
  const categoryMap = {};
  searchList.forEach(category => {
    categoryMap[category.id] = category.name;
  });

  const categoryCount = {};
  orderDetails.forEach(detail => {
    const categoryId = productCategoryMap[detail.product_id];
    if (categoryId && categoryMap[categoryId]) {
      const categoryName = categoryMap[categoryId];
      categoryCount[categoryName] = (categoryCount[categoryName] || 0) + detail.quantity;
    }
  });

  const data = Object.entries(categoryCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    data,
    message: 'Current month order categories retrieved successfully',
  };
};
