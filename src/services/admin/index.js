'use strict';

// Barrel — re-exports all use-cases so consumers can require('./admin') instead of the facade.

module.exports = {
    // Auth
    adminRegister:   require('./use-cases/adminRegister'),
    adminLogin:      require('./use-cases/adminLogin'),
    forgotPassword:  require('./use-cases/forgotPassword'),
    verifyCode:      require('./use-cases/verifyCode'),
    resetPassword:   require('./use-cases/resetPassword'),
    updatePassword:  require('./use-cases/updatePassword'),

    // Admin CRUD
    getCurrentAdmin: require('./use-cases/getCurrentAdmin'),
    getAllAdmins:     require('./use-cases/getAllAdmins'),
    getAdminById:    require('./use-cases/getAdminById'),
    createSubAdmin:  require('./use-cases/createSubAdmin'),
    updateSubAdmin:  require('./use-cases/updateSubAdmin'),
    deleteSubAdmin:  require('./use-cases/deleteSubAdmin'),

    // User Management
    getAllUsers:      require('./use-cases/getAllUsers'),
    exportUsers:      require('./use-cases/exportUsers'),
    getUserById:      require('./use-cases/getUserById'),
    blockUser:        require('./use-cases/blockUser'),
    unblockUser:      require('./use-cases/unblockUser'),
    deleteUser:       require('./use-cases/deleteUser'),
    restoreUser:      require('./use-cases/restoreUser'),
    updateUser:       require('./use-cases/updateUser'),

    // Orders
    getOrders:           require('./use-cases/getOrders'),
    getCoupons:          require('./use-cases/getCoupons'),
    updateOrderStatus:   require('./use-cases/updateOrderStatus'),

    // Analytics
    getProductAnalytics:    require('./use-cases/getProductAnalytics'),
    exportProductAnalytics: require('./use-cases/exportProductAnalytics'),
    getProductViewDetails:  require('./use-cases/getProductViewDetails'),

    // Activity Logs
    getActivityLogs:      require('./use-cases/getActivityLogs'),
    getActivityLogById:   require('./use-cases/getActivityLogById'),
    downloadActivityLogs: require('./use-cases/downloadActivityLogs'),

    // Backend Logs
    getBackendLogs:      require('./use-cases/getBackendLogs'),
    getBackendLogByDate: require('./use-cases/getBackendLogByDate'),
    downloadBackendLogs: require('./use-cases/downloadBackendLogs'),
};
