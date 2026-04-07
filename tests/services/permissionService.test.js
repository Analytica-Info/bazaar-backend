require("../setup");
const mongoose = require("mongoose");
const permissionService = require("../../src/services/permissionService");
const Permission = require("../../src/models/Permission");

function validPermission(overrides = {}) {
  return {
    name: "View Products",
    slug: "view-products",
    module: "products",
    action: "view",
    description: "Allows viewing products",
    ...overrides,
  };
}

describe("permissionService", () => {
  describe("getAllPermissions", () => {
    it("should return empty array when no permissions exist", async () => {
      const result = await permissionService.getAllPermissions();
      expect(result).toEqual([]);
    });
  });

  describe("createPermission", () => {
    it("should create a permission with valid data", async () => {
      const perm = await permissionService.createPermission(validPermission());

      expect(perm.name).toBe("View Products");
      expect(perm.slug).toBe("view-products");
      expect(perm.module).toBe("products");
      expect(perm.action).toBe("view");
      expect(perm.isActive).toBe(true);
    });

    it("should throw on missing required fields", async () => {
      try {
        await permissionService.createPermission({ name: "Incomplete" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });

    it("should throw on duplicate name", async () => {
      await permissionService.createPermission(validPermission());

      try {
        await permissionService.createPermission(
          validPermission({ slug: "different-slug" })
        );
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/name already exists/i);
      }
    });

    it("should throw on duplicate slug", async () => {
      await permissionService.createPermission(validPermission());

      try {
        await permissionService.createPermission(
          validPermission({ name: "Different Name" })
        );
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/slug already exists/i);
      }
    });
  });

  describe("getPermissionsByModule", () => {
    it("should return grouped structure", async () => {
      await Permission.create(validPermission());
      await Permission.create(
        validPermission({
          name: "Edit Products",
          slug: "edit-products",
          action: "edit",
        })
      );
      await Permission.create(
        validPermission({
          name: "View Orders",
          slug: "view-orders",
          module: "orders",
          action: "view",
        })
      );

      const result = await permissionService.getPermissionsByModule();

      expect(result.permissions).toBeDefined();
      expect(result.allPermissions).toHaveLength(3);
      expect(result.permissions.products).toHaveLength(2);
      expect(result.permissions.orders).toHaveLength(1);
    });
  });

  describe("deletePermission", () => {
    it("should soft-delete by setting isActive to false", async () => {
      const perm = await Permission.create(validPermission());

      const result = await permissionService.deletePermission(perm._id.toString());
      expect(result.isActive).toBe(false);

      const saved = await Permission.findById(perm._id);
      expect(saved.isActive).toBe(false);
    });
  });
});
