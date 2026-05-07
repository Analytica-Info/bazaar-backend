'use strict';

const repos = require('../../../repositories');
const cache = require('../../../utilities/cache');

exports.addReview = async (userId, { productId, name, description, title, qualityRating, valueRating, priceRating }, imagePath) => {
  let file = '';
  if (imagePath) {
    file = imagePath;
  }

  const existingReview = await repos.reviews.findOneForUserAndProduct(userId, productId);

  if (existingReview) {
    existingReview.nickname = name;
    existingReview.summary = description;
    existingReview.texttext = title;
    existingReview.quality_rating = qualityRating;
    existingReview.value_rating = valueRating;
    existingReview.price_rating = priceRating;
    if (file) existingReview.image = file;

    await existingReview.save();
  } else {
    await repos.reviews.create({
      user_id: userId,
      nickname: name,
      summary: description,
      texttext: title,
      image: file,
      product_id: productId,
      quality_rating: qualityRating,
      value_rating: valueRating,
      price_rating: priceRating,
    });
  }

  await cache.del(cache.key('catalog', 'top-rated', 'v1')).catch(() => {});

  const reviews = await repos.reviews.listAllProjected();
  const mappedReviews = reviews.map(r => ({
    ...r,
    name: r.nickname,
    description: r.summary,
    title: r.texttext,
  }));

  return {
    message: existingReview ? 'Review updated successfully' : 'Review created successfully',
    reviews: mappedReviews,
  };
};
