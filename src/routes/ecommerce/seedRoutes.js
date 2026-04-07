const express = require('express');
const { seedRolesAndPermissions } = require('../../controllers/ecommerce/seedController');

const router = express.Router();

router.post('/seed-roles-permissions', seedRolesAndPermissions);

module.exports = router;

