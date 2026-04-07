const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const Admin = require('../../models/Admin');
const mongoose = require('mongoose');

exports.getAllRoles = async (req, res) => {
    try {
        const roles = await Role.find({ isActive: true })
            .populate('permissions', 'name slug module action')
            .sort({ createdAt: -1 });
        
        return res.status(200).json({
            success: true,
            roles: roles
        });
    } catch (error) {
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

        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID format.'
            });
        }

        const role = await Role.findById(roleId)
            .populate('permissions', 'name slug module action description');

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found.'
            });
        }

        return res.status(200).json({
            success: true,
            role: role
        });
    } catch (error) {
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

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Role name is required.'
            });
        }

        const existingRole = await Role.findOne({ name: name.trim() });
        if (existingRole) {
            return res.status(400).json({
                success: false,
                message: 'Role with this name already exists.'
            });
        }

        if (permissions && permissions.length > 0) {
            const validPermissions = await Permission.find({
                _id: { $in: permissions },
                isActive: true
            });

            if (validPermissions.length !== permissions.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more permissions are invalid.'
                });
            }
        }

        const role = new Role({
            name: name.trim(),
            description: description?.trim() || '',
            permissions: permissions || []
        });

        await role.save();

        const populatedRole = await Role.findById(role._id)
            .populate('permissions', 'name slug module action');

        return res.status(201).json({
            success: true,
            message: 'Role created successfully.',
            role: populatedRole
        });
    } catch (error) {
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

        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID format.'
            });
        }

        const role = await Role.findById(roleId);
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found.'
            });
        }

        if (name && name.trim() !== role.name) {
            const existingRole = await Role.findOne({ name: name.trim() });
            if (existingRole) {
                return res.status(400).json({
                    success: false,
                    message: 'Role with this name already exists.'
                });
            }
            role.name = name.trim();
        }

        if (description !== undefined) {
            role.description = description?.trim() || '';
        }

        if (permissions !== undefined) {
            if (permissions.length > 0) {
                const validPermissions = await Permission.find({
                    _id: { $in: permissions },
                    isActive: true
                });

                if (validPermissions.length !== permissions.length) {
                    return res.status(400).json({
                        success: false,
                        message: 'One or more permissions are invalid.'
                    });
                }
            }
            role.permissions = permissions;
        }

        role.updatedAt = Date.now();
        await role.save();

        const populatedRole = await Role.findById(role._id)
            .populate('permissions', 'name slug module action');

        return res.status(200).json({
            success: true,
            message: 'Role updated successfully.',
            role: populatedRole
        });
    } catch (error) {
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

        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role ID format.'
            });
        }

        const role = await Role.findById(roleId);
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found.'
            });
        }

        const adminsWithRole = await Admin.countDocuments({ role: roleId });
        if (adminsWithRole > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role. ${adminsWithRole} admin(s) are using this role.`
            });
        }

        role.isActive = false;
        role.updatedAt = Date.now();
        await role.save();

        return res.status(200).json({
            success: true,
            message: 'Role deleted successfully.'
        });
    } catch (error) {
        console.error('Delete Role Error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting role.',
            error: error.message
        });
    }
};

