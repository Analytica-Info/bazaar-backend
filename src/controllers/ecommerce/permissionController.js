const Permission = require('../../models/Permission');
const mongoose = require('mongoose');

exports.getAllPermissions = async (req, res) => {
    try {
        const permissions = await Permission.find({ isActive: true })
            .sort({ module: 1, action: 1 });
        
        return res.status(200).json({
            success: true,
            permissions: permissions
        });
    } catch (error) {
        console.error('Get All Permissions Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching permissions.',
            error: error.message
        });
    }
};

exports.getPermissionsByModule = async (req, res) => {
    try {
        const permissions = await Permission.find({ isActive: true })
            .sort({ module: 1, action: 1 });
        
        const groupedPermissions = permissions.reduce((acc, permission) => {
            if (!acc[permission.module]) {
                acc[permission.module] = [];
            }
            acc[permission.module].push(permission);
            return acc;
        }, {});

        return res.status(200).json({
            success: true,
            permissions: groupedPermissions,
            allPermissions: permissions
        });
    } catch (error) {
        console.error('Get Permissions By Module Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching permissions.',
            error: error.message
        });
    }
};

exports.getPermissionById = async (req, res) => {
    try {
        const { permissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission ID format.'
            });
        }

        const permission = await Permission.findById(permissionId);

        if (!permission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found.'
            });
        }

        return res.status(200).json({
            success: true,
            permission: permission
        });
    } catch (error) {
        console.error('Get Permission By ID Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching permission.',
            error: error.message
        });
    }
};

exports.createPermission = async (req, res) => {
    try {
        const { name, slug, description, module, action } = req.body;

        if (!name || !slug || !module || !action) {
            return res.status(400).json({
                success: false,
                message: 'Name, slug, module, and action are required.'
            });
        }

        const existingPermission = await Permission.findOne({ 
            $or: [
                { name: name.trim() },
                { slug: slug.trim().toLowerCase() }
            ]
        });
        
        if (existingPermission) {
            return res.status(400).json({
                success: false,
                message: 'Permission with this name or slug already exists.'
            });
        }

        const permission = new Permission({
            name: name.trim(),
            slug: slug.trim().toLowerCase(),
            description: description?.trim() || '',
            module: module.trim(),
            action: action.trim()
        });

        await permission.save();

        return res.status(201).json({
            success: true,
            message: 'Permission created successfully.',
            permission: permission
        });
    } catch (error) {
        console.error('Create Permission Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while creating permission.',
            error: error.message
        });
    }
};

exports.updatePermission = async (req, res) => {
    try {
        const { permissionId } = req.params;
        const { name, slug, description, module, action } = req.body;

        if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission ID format.'
            });
        }

        const permission = await Permission.findById(permissionId);
        if (!permission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found.'
            });
        }

        if (name && name.trim() !== permission.name) {
            const existingPermission = await Permission.findOne({ name: name.trim() });
            if (existingPermission) {
                return res.status(400).json({
                    success: false,
                    message: 'Permission with this name already exists.'
                });
            }
            permission.name = name.trim();
        }

        if (slug && slug.trim().toLowerCase() !== permission.slug) {
            const existingPermission = await Permission.findOne({ slug: slug.trim().toLowerCase() });
            if (existingPermission) {
                return res.status(400).json({
                    success: false,
                    message: 'Permission with this slug already exists.'
                });
            }
            permission.slug = slug.trim().toLowerCase();
        }

        if (description !== undefined) permission.description = description?.trim() || '';
        if (module !== undefined) permission.module = module.trim();
        if (action !== undefined) permission.action = action.trim();

        permission.updatedAt = Date.now();
        await permission.save();

        return res.status(200).json({
            success: true,
            message: 'Permission updated successfully.',
            permission: permission
        });
    } catch (error) {
        console.error('Update Permission Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating permission.',
            error: error.message
        });
    }
};

exports.deletePermission = async (req, res) => {
    try {
        const { permissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(permissionId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission ID format.'
            });
        }

        const permission = await Permission.findById(permissionId);
        if (!permission) {
            return res.status(404).json({
                success: false,
                message: 'Permission not found.'
            });
        }

        permission.isActive = false;
        permission.updatedAt = Date.now();
        await permission.save();

        return res.status(200).json({
            success: true,
            message: 'Permission deleted successfully.'
        });
    } catch (error) {
        console.error('Delete Permission Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting permission.',
            error: error.message
        });
    }
};

