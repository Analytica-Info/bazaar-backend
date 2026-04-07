const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const Admin = require('../models/Admin');

const permissions = [
    { name: 'Dashboard', slug: 'dashboard', module: 'Dashboard', action: 'view', description: 'Access dashboard' },
    { name: 'Products', slug: 'products', module: 'Products', action: 'view', description: 'Access products' },
    { name: 'Products Without Images', slug: 'products-without-images', module: 'Products', action: 'view', description: 'Access products without images' },
    { name: 'Database Sync Logs', slug: 'sync-logs', module: 'Sync Logs', action: 'view', description: 'Access database sync logs' },
    { name: 'Coupons', slug: 'coupons', module: 'Coupons', action: 'view', description: 'Access coupons' },
    { name: 'Bank Promo Codes', slug: 'bank-promo-codes', module: 'Bank Promo Codes', action: 'view', description: 'Create and manage bank-specific promo codes (discount, BIN ranges, expiry)' },
    { name: 'Newsletters', slug: 'newsletters', module: 'Newsletters', action: 'view', description: 'Access newsletters' },
    { name: 'Orders', slug: 'orders', module: 'Orders', action: 'view', description: 'Access orders' },
    { name: 'Orders Flash Sale', slug: 'orders-flash-sale', module: 'Orders', action: 'manage', description: 'Create and disable flash sale' },
    { name: 'Orders Export', slug: 'orders-export', module: 'Orders', action: 'manage', description: 'Export orders to Excel, PDF, or Print' },
    { name: 'Orders View Detail', slug: 'orders-view-detail', module: 'Orders', action: 'view', description: 'View order detail modal' },
    { name: 'Orders Update Status', slug: 'orders-update-status', module: 'Orders', action: 'edit', description: 'Update order status' },
    { name: 'Analytics', slug: 'analytics', module: 'Analytics', action: 'view', description: 'Access product analytics' },
    { name: 'Analytics Export', slug: 'analytics-export', module: 'Analytics', action: 'manage', description: 'Export product analytics to Excel' },
    { name: 'User Management', slug: 'users', module: 'Users', action: 'view', description: 'Access user management' },
    { name: 'Users Export', slug: 'users-export', module: 'Users', action: 'manage', description: 'Export users to Excel' },
    { name: 'Users View Detail', slug: 'users-view-detail', module: 'Users', action: 'view', description: 'View user detail modal' },
    { name: 'Users Update Status', slug: 'users-update-status', module: 'Users', action: 'edit', description: 'Update user status (block/unblock/delete/restore)' },
    { name: 'Users Edit', slug: 'users-edit', module: 'Users', action: 'edit', description: 'Edit user details' },
    { name: 'Admin Management', slug: 'sub-admins', module: 'Sub-Admins', action: 'view', description: 'Access admin management' },
    { name: 'Admin Create', slug: 'sub-admins-create', module: 'Sub-Admins', action: 'create', description: 'Create admin' },
    { name: 'Admin Edit', slug: 'sub-admins-edit', module: 'Sub-Admins', action: 'edit', description: 'Edit admin' },
    { name: 'Admin Delete', slug: 'sub-admins-delete', module: 'Sub-Admins', action: 'delete', description: 'Delete admin' },
    { name: 'Role Management', slug: 'roles', module: 'Roles', action: 'view', description: 'Access role management' },
    { name: 'Email Configuration', slug: 'email-config', module: 'Email', action: 'view', description: 'Access email configuration' },
    { name: 'Notification Management', slug: 'notifications', module: 'Notifications', action: 'view', description: 'Access notification management' },
    { name: 'CMS Coupon', slug: 'cms-coupon', module: 'CMS', action: 'view', description: 'Access CMS coupon' },
    { name: 'CMS Header Info', slug: 'cms-header', module: 'CMS', action: 'view', description: 'Access CMS header info' },
    { name: 'CMS Slider', slug: 'cms-slider', module: 'CMS', action: 'view', description: 'Access CMS slider' },
    { name: 'CMS Features', slug: 'cms-features', module: 'CMS', action: 'view', description: 'Access CMS features' },
    { name: 'CMS Footer Info', slug: 'cms-footer', module: 'CMS', action: 'view', description: 'Access CMS footer info' },
    { name: 'CMS About', slug: 'cms-about', module: 'CMS', action: 'view', description: 'Access CMS about' },
    { name: 'CMS Shop', slug: 'cms-shop', module: 'CMS', action: 'view', description: 'Access CMS shop' },
    { name: 'CMS Contact', slug: 'cms-contact', module: 'CMS', action: 'view', description: 'Access CMS contact' },
    { name: 'CMS Brands Logo', slug: 'cms-brands', module: 'CMS', action: 'view', description: 'Access CMS brands logo' },
    { name: 'Activity Logs', slug: 'activity-logs', module: 'Logs', action: 'view', description: 'Access mobile app frontend activity logs' },
    { name: 'Backend Logs', slug: 'backend-logs', module: 'Logs', action: 'view', description: 'Access backend API logs' },
];

async function seedRolesAndPermissions() {
    try {
        await connectDB();

        const createdPermissions = [];

        for (const permData of permissions) {
            let permission = await Permission.findOne({ slug: permData.slug });
            if (!permission) {
                permission = new Permission({
                    ...permData,
                    isActive: true
                });
                await permission.save();
            } else {
                permission.name = permData.name;
                permission.module = permData.module;
                permission.action = permData.action;
                permission.description = permData.description;
                permission.isActive = true;
                await permission.save();
            }
            createdPermissions.push(permission);
        }

        console.log(`Processed ${createdPermissions.length} permissions`);

        let superAdminRole = await Role.findOne({ name: 'Super Admin' });

        if (!superAdminRole) {
            superAdminRole = new Role({
                name: 'Super Admin',
                description: 'Super Admin role with all permissions',
                permissions: createdPermissions.map(p => p._id),
                isActive: true
            });
            await superAdminRole.save();
        } else {
            const allPermissionIds = createdPermissions.map(p => p._id);
            const existingPermissionIds = superAdminRole.permissions.map(p => p.toString());
            const newPermissionIds = allPermissionIds.filter(p => !existingPermissionIds.includes(p.toString()));

            if (newPermissionIds.length > 0) {
                superAdminRole.permissions = [...superAdminRole.permissions, ...newPermissionIds];
            }

            superAdminRole.permissions = createdPermissions.map(p => p._id);
            superAdminRole.isActive = true;
            await superAdminRole.save();
        }

        const allAdmins = await Admin.find();
        if (allAdmins.length > 0) {
            for (const admin of allAdmins) {
                if (!admin.role || admin.role.toString() !== superAdminRole._id.toString()) {
                    admin.role = superAdminRole._id;
                    await admin.save();
                }
            }
        }

        console.log('Permissions and roles seeded successfully!');
        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

seedRolesAndPermissions();
