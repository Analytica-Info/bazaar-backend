'use strict';

/**
 * Maps technical auth error messages thrown by service/use-cases
 * to user-friendly messages + stable machine-readable codes for v2 clients.
 *
 * Pattern can be a string (exact match) or RegExp. First match wins.
 * Status is carried over from the original throw unless statusOverride is set.
 */

const AUTH_ERROR_MAP = [
    // ── Credentials / login ──────────────────────────────────────────────────
    {
        pattern: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please enter your email and password to sign in.',
    },
    {
        pattern: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
        userMessage: "The email or password you entered doesn't match our records. Please try again.",
    },
    {
        pattern: 'Invalid email',
        code: 'INVALID_CREDENTIALS',
        userMessage: "The email or password you entered doesn't match our records. Please try again.",
    },
    {
        pattern: /This account was created using (Google|Apple) sign-in\. Please use (Google|Apple) to login\./,
        code: 'SOCIAL_LOGIN_REQUIRED',
        userMessage: 'This account uses a social sign-in provider. Please sign in with Google or Apple instead.',
    },

    // ── Account state ────────────────────────────────────────────────────────
    {
        pattern: 'Your account has been blocked. Please contact support for assistance.',
        code: 'ACCOUNT_BLOCKED',
        // already user-friendly — preserve verbatim
        userMessage: 'Your account has been blocked. Please contact support for assistance.',
    },
    {
        pattern: 'Your account has been deleted by an administrator. Please contact support for assistance.',
        code: 'ACCOUNT_DELETED_ADMIN',
        userMessage: 'Your account has been deleted by an administrator. Please contact support for assistance.',
    },
    {
        pattern: 'Your account has been deleted. Please register again.',
        code: 'ACCOUNT_DELETED',
        userMessage: 'This account has been deleted. Please create a new account or recover your existing one.',
    },
    {
        pattern: 'Your account has been deleted. Please register again.',
        code: 'ACCOUNT_DELETED',
        userMessage: 'This account has been deleted. Please create a new account or recover your existing one.',
    },
    {
        pattern: 'Account already deleted',
        code: 'ACCOUNT_ALREADY_DELETED',
        userMessage: 'This account has already been deleted.',
    },

    // ── Registration ─────────────────────────────────────────────────────────
    {
        pattern: 'All fields are required',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please fill in all required fields to create an account.',
    },
    {
        pattern: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        code: 'PASSWORD_TOO_WEAK',
        userMessage: 'Please choose a stronger password (at least 8 characters with uppercase letters, numbers, and a special character).',
    },
    {
        pattern: 'Phone already exists with another user',
        code: 'PHONE_ALREADY_REGISTERED',
        userMessage: 'A phone number you provided is already linked to another account. Please use a different number.',
    },
    {
        pattern: 'Phone already exists in coupons',
        code: 'PHONE_ALREADY_REGISTERED',
        userMessage: 'A phone number you provided is already linked to another account. Please use a different number.',
    },
    {
        pattern: /An account with this email was previously deleted\. We have sent a recovery code to this email\./i,
        code: 'ACCOUNT_RECOVERY_REQUIRED',
        userMessage: 'An account with this email was previously deleted. We have sent a recovery code to this email — please use it to restore your account.',
    },
    {
        pattern: 'User already exists with this email',
        code: 'EMAIL_ALREADY_REGISTERED',
        userMessage: 'An account with this email already exists. Please sign in instead, or use a different email.',
    },

    // ── Google OAuth ─────────────────────────────────────────────────────────
    {
        pattern: 'Either tokenId or accessToken is required',
        code: 'GOOGLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Google. Please try again.",
    },
    {
        pattern: 'Email not provided by Google',
        code: 'GOOGLE_SIGN_IN_FAILED',
        userMessage: "We couldn't retrieve your email from Google. Please ensure your Google account has an email address and try again.",
    },
    {
        pattern: /Invalid or expired Google access token/i,
        code: 'GOOGLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Google. Please try again.",
    },
    {
        pattern: /Invalid tokenId format/i,
        code: 'GOOGLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Google. Please try again.",
    },
    {
        pattern: /Invalid or expired Google token/i,
        code: 'GOOGLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Google. Please try again.",
    },

    // ── Apple OAuth ──────────────────────────────────────────────────────────
    {
        pattern: 'Missing Apple identity token',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "Apple sign-in didn't complete. Please try again.",
    },
    {
        pattern: 'Authorization code is required for Apple login',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "Apple sign-in didn't complete. Please try again.",
    },
    {
        pattern: 'Invalid identity token',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Apple. Please try again, or use a different sign-in method.",
    },
    {
        pattern: 'Invalid identity token payload',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Apple. Please try again, or use a different sign-in method.",
    },
    {
        pattern: 'Invalid or malformed Apple identity token',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Apple. Please try again, or use a different sign-in method.",
    },
    {
        pattern: 'Invalid token issuer',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Apple. Please try again, or use a different sign-in method.",
    },
    {
        pattern: 'Invalid token audience',
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Apple. Please try again, or use a different sign-in method.",
    },
    {
        pattern: /Invalid or expired Apple identity token/i,
        code: 'APPLE_SIGN_IN_FAILED',
        userMessage: "We couldn't sign you in with Apple. Please try again, or use a different sign-in method.",
    },

    // ── OAuth generic ────────────────────────────────────────────────────────
    {
        pattern: /Unknown OAuth provider/i,
        code: 'OAUTH_PROVIDER_UNSUPPORTED',
        userMessage: "This sign-in method isn't supported. Please use email or another available option.",
    },

    // ── Refresh / session tokens ─────────────────────────────────────────────
    {
        pattern: 'No token provided',
        code: 'SESSION_MISSING',
        userMessage: 'Please sign in to continue.',
    },
    {
        pattern: 'Invalid or expired refresh token',
        code: 'SESSION_EXPIRED',
        userMessage: 'Your session has expired. Please sign in again.',
    },
    {
        pattern: 'User not found or sessions missing',
        code: 'SESSION_EXPIRED',
        userMessage: 'Your session has expired. Please sign in again.',
    },
    {
        pattern: 'Invalid refresh token',
        code: 'SESSION_EXPIRED',
        userMessage: 'Your session has expired. Please sign in again.',
    },
    {
        pattern: 'Access token missing',
        code: 'SESSION_MISSING',
        userMessage: 'Please sign in to continue.',
    },
    {
        pattern: 'Access token expired. Refresh token missing',
        code: 'SESSION_EXPIRED',
        userMessage: 'Your session has expired. Please sign in again.',
    },
    {
        pattern: 'Invalid access token',
        code: 'SESSION_EXPIRED',
        userMessage: 'Your session has expired. Please sign in again.',
    },

    // ── Forgot password ──────────────────────────────────────────────────────
    {
        pattern: 'Password reset is not available for social login accounts.',
        code: 'SOCIAL_ACCOUNT_NO_PASSWORD',
        userMessage: 'Password reset is not available for accounts that sign in with Google or Apple. Please use your social sign-in method.',
    },

    // ── Verify code / reset password ─────────────────────────────────────────
    {
        pattern: 'Code expired or invalid',
        code: 'CODE_INVALID',
        userMessage: 'The code you entered is incorrect or has expired. Please request a new one and try again.',
    },
    {
        pattern: 'Invalid code',
        code: 'CODE_INVALID',
        userMessage: 'The code you entered is incorrect. Please check and try again.',
    },

    // ── User lookup ──────────────────────────────────────────────────────────
    {
        pattern: 'User not found',
        code: 'ACCOUNT_NOT_FOUND',
        userMessage: "We couldn't find an account with that information. Please check your details or create a new account.",
    },

    // ── Update password ───────────────────────────────────────────────────────
    {
        pattern: 'Invalid password format',
        code: 'VALIDATION_ERROR',
        userMessage: 'The password format is not valid. Please try again.',
    },
    {
        pattern: 'Old password is incorrect',
        code: 'CURRENT_PASSWORD_INCORRECT',
        userMessage: 'The current password you entered is incorrect. Please try again.',
    },
    {
        pattern: 'New password must be different from the old password',
        code: 'PASSWORD_SAME_AS_OLD',
        userMessage: 'Your new password must be different from your current password.',
    },

    // ── Update profile ────────────────────────────────────────────────────────
    {
        pattern: 'Name is required',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please provide your name.',
    },
    {
        pattern: 'Email is required',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please provide your email address.',
    },
    {
        pattern: 'Phone is required',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please provide your phone number.',
    },
    {
        pattern: 'This email is already linked to another account.',
        code: 'EMAIL_ALREADY_REGISTERED',
        userMessage: 'This email address is already linked to another account. Please use a different email.',
    },
    {
        pattern: 'This phone number is already linked to another account.',
        code: 'PHONE_ALREADY_REGISTERED',
        userMessage: 'This phone number is already linked to another account. Please use a different number.',
    },

    // ── Account recovery ──────────────────────────────────────────────────────
    {
        pattern: 'Email is required.',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please provide your email address.',
    },
    {
        pattern: 'No deleted account found with this email.',
        code: 'ACCOUNT_NOT_FOUND',
        userMessage: "We couldn't find a deleted account with that email address.",
    },
    {
        pattern: 'Email, recovery code, and new password are required.',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please provide your email, recovery code, and new password.',
    },
    {
        pattern: 'Invalid recovery code.',
        code: 'RECOVERY_CODE_INVALID',
        userMessage: 'The recovery code you entered is incorrect. Please check and try again.',
    },
    {
        pattern: 'Recovery code has expired. Please request a new one.',
        code: 'RECOVERY_CODE_EXPIRED',
        userMessage: 'Your recovery code has expired. Please request a new one to continue.',
    },
    {
        pattern: 'You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.',
        code: 'RECOVERY_RATE_LIMITED',
        userMessage: "You've made too many recovery attempts. Please wait 24 hours before trying again.",
    },

    // ── Reset password fields ─────────────────────────────────────────────────
    {
        pattern: 'All fields are required',
        code: 'VALIDATION_ERROR',
        userMessage: 'Please fill in all required fields.',
    },
];

/**
 * Translate a thrown service-layer error into a v2-safe error descriptor.
 * Never exposes raw technical messages to the client.
 *
 * @param {Error|{status?: number, message?: string}} err
 * @returns {{ status: number, code: string, message: string }}
 */
function translateAuthError(err) {
    const rawMessage = (err && err.message) || '';
    const status = (err && err.status) || (err && err.name === 'UnauthorizedError' ? 401 : 500);

    for (const entry of AUTH_ERROR_MAP) {
        const matches = entry.pattern instanceof RegExp
            ? entry.pattern.test(rawMessage)
            : entry.pattern === rawMessage;

        if (matches) {
            return {
                status: entry.statusOverride || status,
                code: entry.code,
                message: entry.userMessage,
            };
        }
    }

    // Fallback by HTTP status bucket — never forward raw technical message
    if (status === 400) {
        return { status: 400, code: 'VALIDATION_ERROR', message: 'Please check the information you entered and try again.' };
    }
    if (status === 401) {
        return { status: 401, code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' };
    }
    if (status === 403) {
        return { status: 403, code: 'FORBIDDEN', message: "You don't have permission to do that." };
    }
    if (status === 404) {
        return { status: 404, code: 'NOT_FOUND', message: "We couldn't find what you were looking for." };
    }
    if (status === 409) {
        return { status: 409, code: 'CONFLICT', message: 'That action conflicts with the current state. Please refresh and try again.' };
    }
    if (status === 429) {
        return { status: 429, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment and try again.' };
    }
    return { status: 500, code: 'UNEXPECTED_ERROR', message: 'Something went wrong on our end. Please try again in a moment.' };
}

module.exports = { AUTH_ERROR_MAP, translateAuthError };
