# Service Extraction Plan

**Goal:** Move all business logic and database operations out of controllers into framework-agnostic service files, without breaking any existing functionality.

**Pattern:**
```
Controller (handles req/res) → Service (business logic) → Model (database)
```

Services are plain JS functions that:
- Accept plain objects as input (not req/res)
- Return data or throw `{ status, message }` errors
- Can be called from Express, NestJS, tests, or CLI scripts
- Own all Mongoose queries — controllers never touch models directly

---

## Current State

| Controller | Lines | Functions | Direct DB Calls | Has Service |
|-----------|-------|-----------|----------------|-------------|
| ecommerce/publicController.js | 6,529 | 60 | 156 | No |
| mobile/orderController.js | 3,093 | 12 | 60 | No |
| ecommerce/userController.js | 2,169 | 24 | 73 | No |
| ecommerce/adminController.js | 1,979 | 32 | 81 | No |
| mobile/authController.js | 1,908 | 22 | 66 | No |
| mobile/productController.js | 1,111 | 14 | 31 | No |
| ecommerce/webhookController.js | 763 | 3 | 13 | No |
| ecommerce/orderController.js | 522 | 6 | 15 | No |
| ecommerce/notificationController.js | 452 | 7 | 22 | No |
| mobile/publicController.js | 450 | 4 | 3 | No |
| ecommerce/bankPromoCodeController.js | 361 | 6 | 12 | No |
| mobile/smartCategoriesController.js | 271 | 11 | 1 | Partial (8/11) |
| ecommerce/permissionController.js | 235 | 6 | 12 | No |
| ecommerce/roleController.js | 237 | 5 | 14 | No |
| ecommerce/smartCategoriesController.js | 223 | 13 | 5 | Partial (8/13) |
| ecommerce/productRefreshController.js | 215 | 1 | 6 | No |
| ecommerce/emailController.js | 131 | 3 | 8 | No |
| mobile/notificationController.js | 115 | 3 | 5 | No |
| ecommerce/seedController.js | 115 | 1 | 8 | No |
| ecommerce/giftProductController.js | 96 | 2 | 6 | No |
| shared/bannerImageController.js | 94 | 4 | 8 | No |
| shared/wishlistController.js | 76 | 3 | 4 | No |
| ecommerce/productDiscountFixController.js | 72 | 2 | 2 | No |
| ecommerce/cartController.js | 61 | 5 | 0 | Yes (5/5) |
| mobile/cartController.js | 61 | 5 | 0 | Yes (5/5) |
| **TOTAL** | **~21,000** | **~260** | **~610** | **26/260 done** |

**Currently extracted:** 10% (cart + smartCategories). **Remaining:** ~21,000 lines across 21 controllers.

---

## Extraction Order

Ordered by: impact (lines x DB calls), risk level, and dependency chains. Lower-risk, self-contained modules first.

### Phase 1 — Low Risk, Self-Contained (Week 1)

Small modules with simple CRUD. Build confidence with the pattern.

#### 1.1 wishlistService.js
- **Source:** shared/wishlistController.js (76 lines, 3 functions, 4 DB calls)
- **Functions:** `getWishlist(userId)`, `addToWishlist(userId, productId)`, `removeFromWishlist(userId, productId)`
- **Models:** Wishlist
- **Risk:** Very low — identical logic in both platforms, already shared controller
- **Test:** Extend existing wishlist.test.js

#### 1.2 bannerService.js
- **Source:** shared/bannerImageController.js (94 lines, 4 functions, 8 DB calls)
- **Functions:** `createBanner(data, file)`, `getAllBanners()`, `updateBanner(id, data, file)`, `deleteBanner(id)`
- **Models:** BannerImages
- **Risk:** Very low — simple CRUD, no business logic
- **Test:** New bannerService.test.js

#### 1.3 roleService.js
- **Source:** ecommerce/roleController.js (237 lines, 5 functions, 14 DB calls)
- **Functions:** `getAllRoles()`, `getRoleById(id)`, `createRole(data)`, `updateRole(id, data)`, `deleteRole(id)`
- **Models:** Role, Permission
- **Risk:** Low — simple CRUD, admin-only
- **Test:** New roleService.test.js

#### 1.4 permissionService.js
- **Source:** ecommerce/permissionController.js (235 lines, 6 functions, 12 DB calls)
- **Functions:** `getAll()`, `getByModule()`, `getById(id)`, `create(data)`, `update(id, data)`, `delete(id)`
- **Models:** Permission
- **Risk:** Low — simple CRUD, admin-only
- **Test:** New permissionService.test.js

#### 1.5 emailConfigService.js
- **Source:** ecommerce/emailController.js (131 lines, 3 functions, 8 DB calls)
- **Functions:** `getConfig()`, `updateConfig(data)`, `syncFromEnv()`
- **Models:** EmailConfig
- **Risk:** Low — admin-only config management
- **Test:** New emailConfigService.test.js

#### 1.6 bankPromoCodeService.js
- **Source:** ecommerce/bankPromoCodeController.js (361 lines, 6 functions, 12 DB calls)
- **Functions:** `list(query)`, `create(data)`, `getById(id)`, `update(id, data)`, `toggleActive(id)`, `delete(id)`
- **Models:** BankPromoCode, BankPromoCodeUsage
- **Risk:** Low — admin CRUD
- **Test:** New bankPromoCodeService.test.js

**Phase 1 Total:** 6 services, ~1,134 lines extracted, ~58 DB calls moved

---

### Phase 2 — Medium Risk, Some Complexity (Week 2)

Modules with more business logic but limited external dependencies.

#### 2.1 notificationService.js
- **Source:** ecommerce/notificationController.js (452 lines, 7 functions) + mobile/notificationController.js (115 lines, 3 functions)
- **Functions:**
  - Admin: `createNotification(data)`, `getNotifications(query)`, `getDetails(id)`, `updateNotification(id, data)`, `deleteNotification(id)`, `searchUsers(query)`, `getAllUsers()`
  - User: `getUserNotifications(userId)`, `markAsRead(userId, ids)`, `trackClick(userId, notificationId)`
- **Models:** Notification, User, Admin
- **Risk:** Medium — Firebase push integration, scheduled sends
- **Test:** New notificationService.test.js

#### 2.2 giftProductService.js
- **Source:** ecommerce/giftProductController.js (96 lines, 2 functions)
- **Functions:** `setGiftProduct(productId, data)`, `getGiftProduct()`
- **Models:** Product
- **Risk:** Low
- **Test:** New giftProductService.test.js

#### 2.3 productSyncService.js
- **Source:** ecommerce/productRefreshController.js (215 lines, 1 function) + ecommerce/productDiscountFixController.js (72 lines, 2 functions) + ecommerce/webhookController.js (763 lines, 3 functions)
- **Functions:** `refreshSingleProduct(id)`, `getWebhookProducts()`, `syncDiscounts()`, `handleProductUpdate(data)`, `handleInventoryUpdate(data)`, `handleSaleUpdate(data)`
- **Models:** Product, ProductId, Category, Brand
- **Risk:** Medium — Lightspeed API calls, discount calculations
- **Test:** New productSyncService.test.js (mock external API)

#### 2.4 contactService.js
- **Source:** mobile/publicController.js (450 lines, 4 functions)
- **Functions:** `submitContactForm(data)`, `submitFeedback(userId, data)`, `createMobileAppLog(data)`, `downloadFile(path)`
- **Models:** Contact, ActivityLog
- **Risk:** Low — simple form submissions
- **Test:** New contactService.test.js

**Phase 2 Total:** 4 services, ~2,163 lines extracted, ~80 DB calls moved

---

### Phase 3 — High Impact, Ecommerce User/Auth (Week 3)

The large user-facing controllers with auth, profile, and order logic.

#### 3.1 authService.js
- **Source:** mobile/authController.js (1,908 lines, 22 functions)
- **Functions:**
  - `register(data)`, `login(credentials)`, `googleLogin(token, deviceInfo)`, `appleLogin(idToken, deviceInfo)`
  - `forgotPassword(email)`, `verifyCode(email, code)`, `resetPassword(email, password)`
  - `refreshToken(refreshToken, deviceInfo)`, `checkAccessToken(token)`
  - `updatePassword(userId, oldPw, newPw)`, `updateProfile(userId, data, file)`
  - `deleteAccount(userId)`, `recoverAccount(code)`, `resendRecoveryCode(email)`
  - `getPaymentHistory(userId)`, `getUserData(userId)`
  - `getCoupons(userId)`, `createCoupon(userId, data)`, `checkCouponCode(code)`
  - `setCustomerId(userId, id)`, `getCustomerId(userId)`
- **Models:** User, Coupon, CouponsCount, Order, OrderDetail
- **Risk:** High — auth is critical path. Test every flow.
- **Test:** Comprehensive authService.test.js
- **Note:** The ecommerce userController has similar auth functions (register, login, googleLogin, appleLogin, forgotPassword, etc.). After extracting the service, refactor BOTH controllers to call the same service.

#### 3.2 userService.js
- **Source:** ecommerce/userController.js (2,169 lines, 24 functions) — the NON-auth functions
- **Functions:**
  - `getUserOrders(userId, query)`, `getOrder(userId, orderId)`
  - `getPaymentHistory(userId)`, `getSinglePaymentHistory(userId, id)`
  - `getDashboard(userId)`, `getCurrentMonthOrderCategories(userId)`
  - `getNotifications(userId)`, `markNotificationsRead(userId, ids)`
  - `getUserReviews(userId)`, `addReview(userId, data, file)`
- **Models:** User, Order, OrderDetail, Review, Notification, Coupon
- **Risk:** Medium — user-facing but read-heavy
- **Test:** New userService.test.js

**Phase 3 Total:** 2 services, ~4,077 lines extracted, ~139 DB calls moved

---

### Phase 4 — High Impact, Products & CMS (Week 4)

The largest controller in the codebase — publicController.js at 6,529 lines.

#### 4.1 productService.js
- **Source:** ecommerce/publicController.js (product-related functions) + mobile/productController.js (1,111 lines)
- **Functions:**
  - `getAllProducts(query)`, `getHomeProducts()`, `getProductDetails(id)`
  - `searchProducts(query)`, `searchSingleProduct(query)`
  - `getCategoriesList()`, `getCategoriesProduct(categoryId)`
  - `getSubCategoriesProduct(id)`, `getSubSubCategoriesProduct(id)`
  - `getRandomProducts(excludeId)`, `getSimilarProducts(id)`
  - `getBrands()`, `getBrandName(id)`, `getCategoryName(id)`
  - `getSearchCategories(query)` (mobile-only)
- **Models:** Product, Category, Brand, Review, ProductView
- **Risk:** Medium — core product display, high traffic
- **Test:** New productService.test.js

#### 4.2 cmsService.js
- **Source:** ecommerce/publicController.js (CMS-related functions)
- **Functions:**
  - `getCmsData()` (reads all CMS)
  - `updateSlider(data)`, `updateHeader(data)`, `updateFooter(data)`
  - `updateFeatures(data)`, `updateOffers(data)`, `updateCategoryImages(data)`
  - `updateOfferFilter(data)`, `updateAbout(data)`, `updateShop(data)`
  - `updateContact(data)`, `updateBrandsLogo(data)`
  - `updateCouponCms(data)`, `getCouponCms()`
- **Models:** SliderCms, HeaderInfo, FooterInfoCms, FeaturesCms, OffersCms, CategoriesCms, OfferFilter, About, Shop, ContactCms, BranksLogo, CouponCms
- **Risk:** Low — admin-only writes, public reads
- **Test:** New cmsService.test.js

#### 4.3 couponService.js
- **Source:** ecommerce/publicController.js (coupon functions)
- **Functions:** `getCoupons()`, `checkCouponCode(code, userId)`, `redeemCoupon(data)`, `updateCouponCount()`, `getCouponCount()`
- **Models:** Coupon, CouponsCount, BankPromoCode, BankPromoCodeUsage
- **Risk:** Low
- **Test:** New couponService.test.js

#### 4.4 checkoutService.js
- **Source:** ecommerce/publicController.js (checkout functions)
- **Functions:** `createCardCheckout(data)`, `createTabbyCheckout(data)`, `verifyCardPayment(sessionId)`, `verifyTabbyPayment(paymentId)`, `processCheckout(data)`
- **Models:** Order, OrderDetail, PendingPayment, Cart, Product, User
- **Risk:** HIGH — payment flows. Must not break.
- **Test:** Comprehensive checkoutService.test.js (mock Stripe/Tabby)

#### 4.5 newsletterService.js
- **Source:** ecommerce/publicController.js (newsletter functions)
- **Functions:** `subscribe(email)`, `getSubscribers()`, `sendBulkEmails(data)`
- **Models:** NewsLetter
- **Risk:** Low
- **Test:** New newsletterService.test.js

**Phase 4 Total:** 5 services, ~7,640 lines extracted, ~187 DB calls moved

---

### Phase 5 — Admin & Orders (Week 5)

#### 5.1 adminService.js
- **Source:** ecommerce/adminController.js (1,979 lines, 32 functions)
- **Functions:**
  - Admin auth: `register(data)`, `login(credentials)`, `forgotPassword(email)`, `verifyCode(email, code)`, `resetPassword(email, pw)`, `updatePassword(adminId, oldPw, newPw)`
  - Admin CRUD: `getCurrentAdmin(id)`, `getAllAdmins()`, `getAdminById(id)`, `createSubAdmin(data)`, `updateSubAdmin(id, data)`, `deleteSubAdmin(id)`
  - User management: `getAllUsers(query)`, `exportUsers(query)`, `getUserById(id)`, `blockUser(id)`, `unblockUser(id)`, `deleteUser(id)`, `restoreUser(id)`, `updateUser(id, data)`
  - Orders: `getOrders(query)`, `updateOrderStatus(orderId, data, file)`
  - Analytics: `getProductAnalytics(query)`, `exportProductAnalytics(query)`, `getProductViewDetails(productId)`
  - Logs: `getActivityLogs(query)`, `getActivityLogById(id)`, `getBackendLogs(query)`, `getBackendLogByDate(date, platform)`, `downloadActivityLogs(query)`, `downloadBackendLogs(query)`
- **Models:** Admin, User, Order, OrderDetail, Product, ProductView, ActivityLog, BackendLog
- **Risk:** Medium — admin-only, lower traffic
- **Test:** New adminService.test.js

#### 5.2 orderService.js
- **Source:** ecommerce/orderController.js (522 lines, 6 functions) + mobile/orderController.js (3,093 lines, 12 functions)
- **Functions:**
  - Address: `getAddresses(userId)`, `storeAddress(userId, data)`, `deleteAddress(userId, addressId)`, `setPrimaryAddress(userId, addressId)`
  - Orders: `getOrders(userId)`, `validateInventory(cartData)`, `updateOrderStatus(orderId, data, file)`
  - Checkout (mobile): `createStripeCheckout(userId, data)`, `createTabbyCheckout(userId, data)`, `verifyTabbyPayment(paymentId)`, `handleTabbyWebhook(data)`
  - Payment: `getPaymentIntent()`
- **Models:** User, Order, OrderDetail, Cart, Product, PendingPayment
- **Risk:** HIGH — payment and order flows
- **Test:** Comprehensive orderService.test.js (mock Stripe/Tabby)

**Phase 5 Total:** 2 services, ~5,594 lines extracted, ~156 DB calls moved

---

### Phase 6 — Complete smartCategories extraction (Week 5, parallel)

#### 6.1 Finish smartCategoriesService.js
- Currently 8 of 13 ecommerce functions and 8 of 11 mobile functions use the service
- Remaining ecommerce-only: `toggleFlashSaleStatus`, `getFlashSaleData`, `exportProductsAvailability`
- Remaining mobile-only: `getProductByVariant`, `getColorFromSku` (helper)
- Move these into the service
- Controllers become 100% delegation

**Phase 6 Total:** ~400 lines extracted

---

## Summary

| Phase | Week | Services | Lines | DB Calls | Risk |
|-------|------|----------|-------|----------|------|
| 1 — Small CRUD | 1 | 6 | 1,134 | 58 | Low |
| 2 — Medium complexity | 2 | 4 | 2,163 | 80 | Medium |
| 3 — Auth & User | 3 | 2 | 4,077 | 139 | High |
| 4 — Products & CMS | 4 | 5 | 7,640 | 187 | High (checkout) |
| 5 — Admin & Orders | 5 | 2 | 5,594 | 156 | High (payments) |
| 6 — Finish smartCategories | 5 | 0 (extend) | 400 | ~10 | Low |
| **TOTAL** | **5 weeks** | **19 new** | **~21,000** | **~630** | — |

After completion: **21 services** total (19 new + 2 existing), all controllers become thin req/res wrappers, codebase is ready for NestJS migration.

---

## Rules for Each Extraction

1. **Read the controller function completely** before extracting
2. **Service function signature:** accept plain objects, return plain objects
3. **Error pattern:** throw `{ status: number, message: string }` — controller catches and sends response
4. **File handling:** service accepts file path/buffer, not `req.file` (multer object)
5. **No req/res in services** — ever
6. **Controller stays identical in behavior** — same status codes, same response shape, same field names
7. **Write tests for the service** before refactoring the controller
8. **One service, one commit** — don't batch multiple extractions
9. **Run full test suite after each extraction** to catch regressions
10. **Both ecommerce and mobile controllers** for the same domain should call the same service (like cart does now)

---

## Verification After Each Service Extraction

```bash
# 1. Require paths valid
node -e "..." # (path checker script)

# 2. All tests pass
npm test

# 3. No controller directly imports a Model (except through service)
grep -r "require.*models/" src/controllers/ --include="*.js"
# Should only show: services/ requires in controllers
```

---

## Final Directory Structure (after all phases)

```
src/
├── services/                              # 21 service files
│   ├── cartService.js                     ✅ Done
│   ├── smartCategoriesService.js          ✅ Done
│   ├── wishlistService.js                 Phase 1
│   ├── bannerService.js                   Phase 1
│   ├── roleService.js                     Phase 1
│   ├── permissionService.js               Phase 1
│   ├── emailConfigService.js              Phase 1
│   ├── bankPromoCodeService.js            Phase 1
│   ├── notificationService.js             Phase 2
│   ├── giftProductService.js              Phase 2
│   ├── productSyncService.js              Phase 2
│   ├── contactService.js                  Phase 2
│   ├── authService.js                     Phase 3
│   ├── userService.js                     Phase 3
│   ├── productService.js                  Phase 4
│   ├── cmsService.js                      Phase 4
│   ├── couponService.js                   Phase 4
│   ├── checkoutService.js                 Phase 4
│   ├── newsletterService.js               Phase 4
│   ├── adminService.js                    Phase 5
│   └── orderService.js                    Phase 5
├── controllers/
│   ├── ecommerce/                         # Thin wrappers calling services
│   ├── mobile/                            # Thin wrappers calling services
│   └── shared/                            # Thin wrappers calling services
├── models/                                # Untouched — only services import these
└── ...
```
