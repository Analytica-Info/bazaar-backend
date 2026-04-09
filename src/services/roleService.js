const mongoose = require("mongoose");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const Admin = require("../models/Admin");

const POPULATE_PERMISSIONS = { path: "permissions", select: "name slug module action isActive" };

async function getAllRoles() {
  const roles = await Role.find({ isActive: true })
    .populate(POPULATE_PERMISSIONS)
    .sort({ createdAt: -1 });
  return roles;
}

async function getRoleById(roleId) {
  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw { status: 400, message: "Invalid role ID" };
  }

  const role = await Role.findById(roleId).populate(POPULATE_PERMISSIONS);
  if (!role) {
    throw { status: 404, message: "Role not found" };
  }
  return role;
}

async function createRole({ name, description, permissions }) {
  if (!name) {
    throw { status: 400, message: "Role name is required" };
  }

  const existing = await Role.findOne({ name, isActive: true });
  if (existing) {
    throw { status: 400, message: "Role with this name already exists" };
  }

  if (permissions && permissions.length > 0) {
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
      isActive: true,
    });
    if (validPermissions.length !== permissions.length) {
      throw { status: 400, message: "One or more permissions are invalid or inactive" };
    }
  }

  const role = await Role.create({ name, description, permissions });
  return Role.findById(role._id).populate(POPULATE_PERMISSIONS);
}

async function updateRole(roleId, { name, description, permissions }) {
  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw { status: 400, message: "Invalid role ID" };
  }

  const role = await Role.findById(roleId);
  if (!role) {
    throw { status: 404, message: "Role not found" };
  }

  if (name && name !== role.name) {
    const duplicate = await Role.findOne({ name, isActive: true, _id: { $ne: roleId } });
    if (duplicate) {
      throw { status: 400, message: "Role with this name already exists" };
    }
    role.name = name;
  }

  if (description !== undefined) {
    role.description = description;
  }

  if (permissions) {
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
      isActive: true,
    });
    if (validPermissions.length !== permissions.length) {
      throw { status: 400, message: "One or more permissions are invalid or inactive" };
    }
    role.permissions = permissions;
  }

  await role.save();
  return Role.findById(role._id).populate(POPULATE_PERMISSIONS);
}

async function deleteRole(roleId) {
  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw { status: 400, message: "Invalid role ID" };
  }

  const role = await Role.findById(roleId);
  if (!role) {
    throw { status: 404, message: "Role not found" };
  }

  const adminsUsingRole = await Admin.countDocuments({ role: roleId, isActive: true });
  if (adminsUsingRole > 0) {
    throw {
      status: 400,
      message: "Cannot delete role that is assigned to active admins",
    };
  }

  role.isActive = false;
  await role.save();
  return role;
}

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
};
