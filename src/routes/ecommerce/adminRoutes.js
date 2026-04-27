const express = require('express');
const { orders, coupons, adminRegister, adminLogin, forgotPassword, verifyCode, resetPassword, updatePassword, updateOrderStatus, getAllUsers, exportUsers, getUserById, blockUser, unblockUser, deleteUser, restoreUser, updateUser, getAllAdmins, getAdminById, getCurrentAdmin, createSubAdmin, updateSubAdmin, deleteSubAdmin, getProductAnalytics, exportProductAnalytics, getProductViewDetails, getActivityLogs, getActivityLogById, getBackendLogs, getBackendLogByDate, downloadBackendLogs, downloadActivityLogs, getLiveUsers } = require('../../controllers/ecommerce/adminController');
const { createNotification, getNotifications, getNotificationDetails, updateNotification, deleteNotification, searchUsers, getAllUsersForNotification } = require('../../controllers/ecommerce/notificationController');
const { refreshSingleProductById } = require('../../controllers/ecommerce/productRefreshController');
const {
  getProductsWithProductUpdateWebhook,
  syncProductUpdateWebhookDiscounts,
} = require('../../controllers/ecommerce/productDiscountFixController');
const { setGiftProduct, getGiftProduct } = require('../../controllers/ecommerce/giftProductController');
const { list: listBankPromoCodes, create: createBankPromoCode, getById: getBankPromoCodeById, update: updateBankPromoCode, toggleActive: toggleBankPromoCodeActive, delete: deleteBankPromoCode } = require('../../controllers/ecommerce/bankPromoCodeController');
const shippingCtrl = require('../../controllers/ecommerce/shippingCountryController');
const monitoringCtrl = require('../../controllers/ecommerce/monitoringController');
const adminMiddleware = require('../../middleware/adminMiddleware');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png/;
const orderUpload = createUpload(allowedFileTypes, "uploads/orders");

const router = express.Router();

router.get('/orders', adminMiddleware, checkPermission('orders'), orders);
router.get('/coupon', adminMiddleware, coupons);
router.get('/users', adminMiddleware, checkPermission('users'), getAllUsers);
router.get('/users/live', adminMiddleware, getLiveUsers);
router.get('/users/export', adminMiddleware, checkPermission('users-export'), exportUsers);
router.get('/users/:userId', adminMiddleware, checkPermission('users-view-detail'), getUserById);
router.put('/users/:userId/block', adminMiddleware, checkPermission('users-update-status'), blockUser);
router.put('/users/:userId/unblock', adminMiddleware, checkPermission('users-update-status'), unblockUser);
router.delete('/users/:userId', adminMiddleware, checkPermission('users-update-status'), deleteUser);
router.put('/users/:userId/restore', adminMiddleware, checkPermission('users-update-status'), restoreUser);
router.put('/users/:userId', adminMiddleware, checkPermission('users-edit'), updateUser);

router.get('/admins/me', adminMiddleware, getCurrentAdmin);
router.get('/admins', adminMiddleware, checkPermission('sub-admins'), getAllAdmins);
router.get('/admins/:adminId', adminMiddleware, checkPermission('sub-admins'), getAdminById);
router.post('/admins', adminMiddleware, checkPermission('sub-admins-create'), createSubAdmin);
router.put('/admins/:adminId', adminMiddleware, checkPermission('sub-admins-edit'), updateSubAdmin);
router.delete('/admins/:adminId', adminMiddleware, checkPermission('sub-admins-delete'), deleteSubAdmin);

router.post('/register', adminRegister);
router.post('/login', adminLogin);
router.post('/forgot-password', forgotPassword);
router.post('/verify-code', verifyCode);
router.post('/reset-password',  resetPassword);
router.post('/update-password', adminMiddleware, updatePassword);
router.post("/order-status/:orderId", adminMiddleware, checkPermission('orders-update-status'), orderUpload.single("file"), updateOrderStatus);

router.post("/notifications", adminMiddleware, createNotification);
router.get("/notifications", adminMiddleware, getNotifications);
router.get("/notifications/:notificationId", adminMiddleware, getNotificationDetails);
router.put("/notifications/:notificationId", adminMiddleware, updateNotification);
router.delete("/notifications/:notificationId", adminMiddleware, deleteNotification);
router.get("/notifications/users/search", adminMiddleware, searchUsers);
router.get("/notifications/users/all", adminMiddleware, getAllUsersForNotification);

router.get("/analytics/products", adminMiddleware, checkPermission('analytics'), getProductAnalytics);
router.get("/analytics/products/export", adminMiddleware, checkPermission('analytics-export'), exportProductAnalytics);
router.get("/analytics/products/:productId", adminMiddleware, getProductViewDetails);

router.get("/monitoring/overview", adminMiddleware, monitoringCtrl.getOverview);
router.get("/monitoring/webhooks", adminMiddleware, monitoringCtrl.getWebhookTimeline);
router.get("/monitoring/errors", adminMiddleware, monitoringCtrl.getErrors);
router.get("/monitoring/requests", adminMiddleware, monitoringCtrl.getRequestTimeline);
router.get("/monitoring/discount-sync", adminMiddleware, monitoringCtrl.getDiscountSyncTimeline);

router.get("/logs/activity/download", adminMiddleware, downloadActivityLogs);
router.get("/logs/backend/download", adminMiddleware, downloadBackendLogs);
router.get("/logs/backend/:date/:platform", adminMiddleware, getBackendLogByDate);
router.get("/logs/backend", adminMiddleware, getBackendLogs);
router.get("/logs/:logId", adminMiddleware, getActivityLogById);
router.get("/logs", adminMiddleware, getActivityLogs);
router.post("/refresh-product", refreshSingleProductById);

router.get(
  "/products/webhook-product-update",
  getProductsWithProductUpdateWebhook
);
router.post(
  "/products/sync-webhook-product-update-discounts",
  syncProductUpdateWebhookDiscounts
);

router.post("/products/set-gift", adminMiddleware, setGiftProduct);
router.get("/products/gift", adminMiddleware, getGiftProduct);

router.get("/bank-promo-codes", adminMiddleware, checkPermission('bank-promo-codes'), listBankPromoCodes);
router.post("/bank-promo-codes", adminMiddleware, checkPermission('bank-promo-codes'), createBankPromoCode);
router.get("/bank-promo-codes/:id", adminMiddleware, checkPermission('bank-promo-codes'), getBankPromoCodeById);
router.put("/bank-promo-codes/:id", adminMiddleware, checkPermission('bank-promo-codes'), updateBankPromoCode);
router.patch("/bank-promo-codes/:id/toggle-active", adminMiddleware, checkPermission('bank-promo-codes'), toggleBankPromoCodeActive);
router.delete("/bank-promo-codes/:id", adminMiddleware, checkPermission('bank-promo-codes'), deleteBankPromoCode);

// Shipping Countries
router.get("/shipping-countries", adminMiddleware, shippingCtrl.list);
router.post("/shipping-countries", adminMiddleware, shippingCtrl.create);
router.get("/shipping-countries/:id", adminMiddleware, shippingCtrl.getById);
router.put("/shipping-countries/:id", adminMiddleware, shippingCtrl.update);
router.patch("/shipping-countries/:id/toggle-active", adminMiddleware, shippingCtrl.toggleActive);
router.delete("/shipping-countries/:id", adminMiddleware, shippingCtrl.remove);
// Bulk Import
router.post("/shipping-countries/:id/bulk-cities", adminMiddleware, shippingCtrl.bulkImportCities);
router.post("/shipping-countries/:id/cities/:cityId/bulk-areas", adminMiddleware, shippingCtrl.bulkImportAreas);
// Cities
router.post("/shipping-countries/:id/cities", adminMiddleware, shippingCtrl.addCity);
router.put("/shipping-countries/:id/cities/:cityId", adminMiddleware, shippingCtrl.updateCity);
router.delete("/shipping-countries/:id/cities/:cityId", adminMiddleware, shippingCtrl.removeCity);
// Areas
router.post("/shipping-countries/:id/cities/:cityId/areas", adminMiddleware, shippingCtrl.addArea);
router.put("/shipping-countries/:id/cities/:cityId/areas/:areaId", adminMiddleware, shippingCtrl.updateArea);
router.delete("/shipping-countries/:id/cities/:cityId/areas/:areaId", adminMiddleware, shippingCtrl.removeArea);

module.exports =  router;