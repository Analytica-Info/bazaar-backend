'use strict';

const repos = require('../../../repositories');
const cache = require('../../../utilities/cache');

exports.getProfile = async (userId) => {
  const user = await repos.users.findProfileFields(userId);

  if (!user) {
    throw { status: 404, message: 'User not found' };
  }

  const couponDoc = await repos.coupons.findByPhone(user.phone);
  const coupon = { data: couponDoc || [], status: !!couponDoc };

  return { user, coupon };
};

exports.getOrderCount = async (userId) => {
  const cacheKey = cache.key('orderCount', String(userId));
  const cached = await cache.get(cacheKey);
  if (cached !== null) {
    return { count: Number(cached) };
  }

  const count = await repos.orders.countForUser(userId);

  await cache.set(cacheKey, String(count), 60);
  return { count };
};
