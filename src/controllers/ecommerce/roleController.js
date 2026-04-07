const roleService = require("../../services/roleService");

exports.getAllRoles = async (req, res) => {
    try {
        const roles = await roleService.getAllRoles();
        return res.status(200).json({ success: true, roles });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Get All Roles Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching roles.',
            error: error.message
        });
    }
};

exports.getRoleById = async (req, res) => {
    try {
        const { roleId } = req.params;
        const role = await roleService.getRoleById(roleId);
        return res.status(200).json({ success: true, role });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Get Role By ID Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching role.',
            error: error.message
        });
    }
};

exports.createRole = async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        const role = await roleService.createRole({ name, description, permissions });
        return res.status(201).json({
            success: true,
            message: 'Role created successfully.',
            role
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Create Role Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while creating role.',
            error: error.message
        });
    }
};

exports.updateRole = async (req, res) => {
    try {
        const { roleId } = req.params;
        const { name, description, permissions } = req.body;
        const role = await roleService.updateRole(roleId, { name, description, permissions });
        return res.status(200).json({
            success: true,
            message: 'Role updated successfully.',
            role
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Update Role Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating role.',
            error: error.message
        });
    }
};

exports.deleteRole = async (req, res) => {
    try {
        const { roleId } = req.params;
        await roleService.deleteRole(roleId);
        return res.status(200).json({
            success: true,
            message: 'Role deleted successfully.'
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Delete Role Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting role.',
            error: error.message
        });
    }
};
