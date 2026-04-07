const permissionService = require("../../services/permissionService");

exports.getAllPermissions = async (req, res) => {
    try {
        const permissions = await permissionService.getAllPermissions();
        return res.status(200).json({ success: true, permissions });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        const result = await permissionService.getPermissionsByModule();
        return res.status(200).json({
            success: true,
            permissions: result.permissions,
            allPermissions: result.allPermissions
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        const permission = await permissionService.getPermissionById(permissionId);
        return res.status(200).json({ success: true, permission });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        const permission = await permissionService.createPermission({ name, slug, description, module, action });
        return res.status(201).json({
            success: true,
            message: 'Permission created successfully.',
            permission
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        const permission = await permissionService.updatePermission(permissionId, { name, slug, description, module, action });
        return res.status(200).json({
            success: true,
            message: 'Permission updated successfully.',
            permission
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        await permissionService.deletePermission(permissionId);
        return res.status(200).json({
            success: true,
            message: 'Permission deleted successfully.'
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Delete Permission Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting permission.',
            error: error.message
        });
    }
};
