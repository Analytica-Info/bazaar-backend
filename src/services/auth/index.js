'use strict';

/**
 * auth/index.js — barrel re-exporting all auth use-cases.
 *
 * Consumers requiring './auth' or './auth/index' get the same
 * named exports as the legacy authService facade.
 */

module.exports = {
    register:            require('./use-cases/signup'),
    loginWithCredentials: require('./use-cases/login'),
    googleLogin:         require('./use-cases/googleLogin'),
    appleLogin:          require('./use-cases/appleLogin'),
    forgotPassword:      require('./use-cases/forgotPassword'),
    verifyCode:          require('./use-cases/verifyCode'),
    resetPassword:       require('./use-cases/resetPassword'),
    updatePassword:      require('./use-cases/updatePassword'),
    refreshToken:        require('./use-cases/refresh'),
    checkAccessToken:    require('./use-cases/checkAccessToken'),
    deleteAccount:       require('./use-cases/deleteAccount'),
    deleteAccountPublic: require('./use-cases/deleteAccountPublic'),
    verifyRecoveryCode:  require('./use-cases/verifyRecoveryCode'),
    resendRecoveryCode:  require('./use-cases/resendRecoveryCode'),
    updateProfile:       require('./use-cases/updateProfile'),
    getUserData:         require('./use-cases/getUserData'),
    // Expose helpers for controllers that need raw device/session access
    _helpers: {
        getDeviceInfo:           require('./domain/sessionState').getDeviceInfo,
        upsertSession:           require('./domain/sessionState').upsertSession,
        generateTokens:          require('./domain/tokenIssuer').generateTokens,
        generateVerificationCode: require('./use-cases/_shared').generateVerificationCode,
    },
};
