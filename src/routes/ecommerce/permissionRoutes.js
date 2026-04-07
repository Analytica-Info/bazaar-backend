const express = require('express');
const {
    getAllPermissions,
    getPermissionsByModule,
    getPermissionById,
    createPermission,
    updatePermission,
    deletePermission
} = require('../../controllers/ecommerce/permissionController');
const adminMiddleware = require('../../middleware/adminMiddleware');

const router = express.Router();

router.get('/', adminMiddleware, getAllPermissions);
router.get('/by-module', adminMiddleware, getPermissionsByModule);
router.get('/:permissionId', adminMiddleware, getPermissionById);
router.post('/', adminMiddleware, createPermission);
router.put('/:permissionId', adminMiddleware, updatePermission);
router.delete('/:permissionId', adminMiddleware, deletePermission);

module.exports = router;

