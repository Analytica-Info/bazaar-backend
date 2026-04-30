const mongoose = require("mongoose");
const Permission = require('../repositories').permissions.rawModel();

async function getAllPermissions() {
  const permissions = await Permission.find({ isActive: true }).sort({
    module: 1,
    action: 1,
  });
  return permissions;
}

async function getPermissionsByModule() {
  const allPermissions = await Permission.find({ isActive: true }).sort({
    module: 1,
    action: 1,
  });

  const grouped = allPermissions.reduce((acc, perm) => {
    const mod = perm.module;
    if (!acc[mod]) {
      acc[mod] = [];
    }
    acc[mod].push(perm);
    return acc;
  }, {});

  return { permissions: grouped, allPermissions };
}

async function getPermissionById(permissionId) {
  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw { status: 400, message: "Invalid permission ID" };
  }

  const permission = await Permission.findById(permissionId);
  if (!permission) {
    throw { status: 404, message: "Permission not found" };
  }
  return permission;
}

async function createPermission({ name, slug, description, module, action }) {
  if (!name || !slug || !module || !action) {
    throw { status: 400, message: "name, slug, module, and action are required" };
  }

  const duplicateName = await Permission.findOne({ name, isActive: true });
  if (duplicateName) {
    throw { status: 400, message: "Permission with this name already exists" };
  }

  const duplicateSlug = await Permission.findOne({ slug, isActive: true });
  if (duplicateSlug) {
    throw { status: 400, message: "Permission with this slug already exists" };
  }

  const permission = await Permission.create({
    name,
    slug,
    description,
    module,
    action,
  });
  return permission;
}

async function updatePermission(permissionId, { name, slug, description, module, action }) {
  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw { status: 400, message: "Invalid permission ID" };
  }

  const permission = await Permission.findById(permissionId);
  if (!permission) {
    throw { status: 404, message: "Permission not found" };
  }

  if (name && name !== permission.name) {
    const duplicate = await Permission.findOne({
      name,
      isActive: true,
      _id: { $ne: permissionId },
    });
    if (duplicate) {
      throw { status: 400, message: "Permission with this name already exists" };
    }
    permission.name = name;
  }

  if (slug && slug !== permission.slug) {
    const duplicate = await Permission.findOne({
      slug,
      isActive: true,
      _id: { $ne: permissionId },
    });
    if (duplicate) {
      throw { status: 400, message: "Permission with this slug already exists" };
    }
    permission.slug = slug;
  }

  if (description !== undefined) {
    permission.description = description;
  }
  if (module) {
    permission.module = module;
  }
  if (action) {
    permission.action = action;
  }

  await permission.save();
  return permission;
}

async function deletePermission(permissionId) {
  if (!mongoose.Types.ObjectId.isValid(permissionId)) {
    throw { status: 400, message: "Invalid permission ID" };
  }

  const permission = await Permission.findById(permissionId);
  if (!permission) {
    throw { status: 404, message: "Permission not found" };
  }

  permission.isActive = false;
  await permission.save();
  return permission;
}

module.exports = {
  getAllPermissions,
  getPermissionsByModule,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
};
