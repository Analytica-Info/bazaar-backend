'use strict';

const CouponCms = require('../../../repositories').couponCms.rawModel();
const HeaderInfoCms = require('../../../repositories').headerInfo.rawModel();
const SliderCms = require('../../../repositories').sliderCms.rawModel();
const FeaturesCms = require('../../../repositories').featuresCms.rawModel();
const OffersCms = require('../../../repositories').offersCms.rawModel();
const CategoryImagesCms = require('../../../repositories').categoriesCms.rawModel();
const OfferFilterCms = require('../../../repositories').offerFilters.rawModel();
const FooterInfoCms = require('../../../repositories').footerInfoCms.rawModel();
const AboutCms = require('../../../repositories').abouts.rawModel();
const ShopCms = require('../../../repositories').shops.rawModel();
const ContactCms = require('../../../repositories').contactsCms.rawModel();
const BrandsLogoCms = require('../../../repositories').brandsLogos.rawModel();

const logger = require('../../../utilities/logger');
const cache = require('../../../utilities/cache');
const { CMS_CACHE_KEY, CMS_CACHE_TTL } = require('../domain/cacheInvalidation');

/**
 * Fetch all CMS sections (cached 30 min).
 */
async function getCmsData() {
    return cache.getOrSet(CMS_CACHE_KEY, CMS_CACHE_TTL, async () => {
        try {
            const [
                couponCms, headerInfoCms, sliderCms, featuresCms, offersCms,
                categoryImagesCms, offerFilterCms, footerInfoCms, aboutCms,
                shopCms, contactCms, brandsLogoCms,
            ] = await Promise.all([
                CouponCms.findOne().lean(),
                HeaderInfoCms.findOne().lean(),
                SliderCms.findOne().lean(),
                FeaturesCms.findOne().lean(),
                OffersCms.findOne().lean(),
                CategoryImagesCms.findOne().lean(),
                OfferFilterCms.findOne().lean(),
                FooterInfoCms.findOne().lean(),
                AboutCms.findOne().lean(),
                ShopCms.findOne().lean(),
                ContactCms.findOne().lean(),
                BrandsLogoCms.findOne().lean(),
            ]);

            return {
                couponCmsData: couponCms,
                headerInfoCmsData: headerInfoCms,
                sliderCmsData: sliderCms,
                featuresCmsData: featuresCms,
                offersCmsData: offersCms,
                categoryImagesCmsData: categoryImagesCms,
                offerFilterCmsData: offerFilterCms,
                footerInfoCmsData: footerInfoCms,
                aboutCmsData: aboutCms,
                shopCmsData: shopCms,
                contactCmsData: contactCms,
                brandsLogoCmsData: brandsLogoCms,
            };
        } catch (error) {
            logger.error(`Error fetching Cms data: ${error.message}`);
            throw { status: 500, message: "Error fetching Cms data" };
        }
    });
}

module.exports = { getCmsData };
