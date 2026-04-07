const express = require('express');
const {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
} = require('../../controllers/ecommerce/roleController');
const adminMiddleware = require('../../middleware/adminMiddleware');

const router = express.Router();

router.get('/', adminMiddleware, getAllRoles);
router.get('/:roleId', adminMiddleware, getRoleById);
router.post('/', adminMiddleware, createRole);
router.put('/:roleId', adminMiddleware, updateRole);
router.delete('/:roleId', adminMiddleware, deleteRole);

module.exports = router;

