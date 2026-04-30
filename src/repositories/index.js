/**
 * Repository registry.
 *
 * Services should import this module and call `repos.<entity>.<method>(...)`
 * instead of importing Mongoose models directly.
 *
 * Migration status: every entity has a repository registered here. Smaller
 * services consume semantic methods; larger services (orderService,
 * checkoutService, productService, authService, adminService) currently
 * source their model via `repos.<entity>.rawModel()` as a transitional seam,
 * to be replaced with semantic methods incrementally.
 *
 * See docs/architecture/repository-layer.md.
 */
const NotificationRepository = require('./NotificationRepository');
const UserRepository = require('./UserRepository');
const AdminRepository = require('./AdminRepository');
const OrderRepository = require('./OrderRepository');
const OrderDetailRepository = require('./OrderDetailRepository');
const ProductRepository = require('./ProductRepository');
const ReviewRepository = require('./ReviewRepository');
const WishlistRepository = require('./WishlistRepository');
const CategoryRepository = require('./CategoryRepository');
const CouponRepository = require('./CouponRepository');
const PendingPaymentRepository = require('./PendingPaymentRepository');
const BankPromoCodeRepository = require('./BankPromoCodeRepository');
const BankPromoCodeUsageRepository = require('./BankPromoCodeUsageRepository');
const BannerImagesRepository = require('./BannerImagesRepository');
const BrandRepository = require('./BrandRepository');
const BrandsLogoRepository = require('./BrandsLogoRepository');
const CartRepository = require('./CartRepository');
const CartDataRepository = require('./CartDataRepository');
const CategoriesCmsRepository = require('./CategoriesCmsRepository');
const ContactRepository = require('./ContactRepository');
const ContactCmsRepository = require('./ContactCmsRepository');
const CouponCmsRepository = require('./CouponCmsRepository');
const CouponMobileRepository = require('./CouponMobileRepository');
const CouponsCountRepository = require('./CouponsCountRepository');
const CronjoblogRepository = require('./CronjoblogRepository');
const EmailConfigRepository = require('./EmailConfigRepository');
const FeaturesCmsRepository = require('./FeaturesCmsRepository');
const FlashSaleRepository = require('./FlashSaleRepository');
const FooterInfoCmsRepository = require('./FooterInfoCmsRepository');
const HeaderInfoRepository = require('./HeaderInfoRepository');
const NewsLetterRepository = require('./NewsLetterRepository');
const OfferFilterRepository = require('./OfferFilterRepository');
const OffersCmsRepository = require('./OffersCmsRepository');
const PermissionRepository = require('./PermissionRepository');
const ProductIdRepository = require('./ProductIdRepository');
const ProductViewRepository = require('./ProductViewRepository');
const RoleRepository = require('./RoleRepository');
const ShippingCountryRepository = require('./ShippingCountryRepository');
const ShopRepository = require('./ShopRepository');
const SliderCmsRepository = require('./SliderCmsRepository');
const SyncStateRepository = require('./SyncStateRepository');
const AboutRepository = require('./AboutRepository');
const ActivityLogRepository = require('./ActivityLogRepository');
const BackendLogRepository = require('./BackendLogRepository');
const CoPurchasePairRepository = require('./CoPurchasePairRepository');
const RecommendationEventRepository = require('./RecommendationEventRepository');
const unitOfWork = require('./UnitOfWork');

const repos = {
    notifications: new NotificationRepository(),
    users: new UserRepository(),
    admins: new AdminRepository(),
    orders: new OrderRepository(),
    orderDetails: new OrderDetailRepository(),
    products: new ProductRepository(),
    reviews: new ReviewRepository(),
    wishlists: new WishlistRepository(),
    categories: new CategoryRepository(),
    coupons: new CouponRepository(),
    pendingPayments: new PendingPaymentRepository(),
    bankPromoCodes: new BankPromoCodeRepository(),
    bankPromoCodeUsages: new BankPromoCodeUsageRepository(),
    bannerImages: new BannerImagesRepository(),
    brands: new BrandRepository(),
    brandsLogos: new BrandsLogoRepository(),
    carts: new CartRepository(),
    cartData: new CartDataRepository(),
    categoriesCms: new CategoriesCmsRepository(),
    contacts: new ContactRepository(),
    contactsCms: new ContactCmsRepository(),
    couponCms: new CouponCmsRepository(),
    couponsMobile: new CouponMobileRepository(),
    couponsCount: new CouponsCountRepository(),
    cronJoblogs: new CronjoblogRepository(),
    emailConfigs: new EmailConfigRepository(),
    featuresCms: new FeaturesCmsRepository(),
    flashSales: new FlashSaleRepository(),
    footerInfoCms: new FooterInfoCmsRepository(),
    headerInfo: new HeaderInfoRepository(),
    newsletters: new NewsLetterRepository(),
    offerFilters: new OfferFilterRepository(),
    offersCms: new OffersCmsRepository(),
    permissions: new PermissionRepository(),
    productIds: new ProductIdRepository(),
    productViews: new ProductViewRepository(),
    roles: new RoleRepository(),
    shippingCountries: new ShippingCountryRepository(),
    shops: new ShopRepository(),
    sliderCms: new SliderCmsRepository(),
    syncStates: new SyncStateRepository(),
    abouts: new AboutRepository(),
    activityLogs: new ActivityLogRepository(),
    backendLogs: new BackendLogRepository(),
    coPurchasePairs: new CoPurchasePairRepository(),
    recommendationEvents: new RecommendationEventRepository(),
};

module.exports = {
    ...repos,
    unitOfWork,
};
