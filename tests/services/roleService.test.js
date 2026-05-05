require("../setup");
const mongoose = require("mongoose");
const roleService = require("../../src/services/roleService");
const Role = require("../../src/models/Role");
const Permission = require("../../src/models/Permission");
const Admin = require("../../src/models/Admin");

describe("roleService", () => {
  describe("getAllRoles", () => {
    it("should return empty array when no roles exist", async () => {
      const result = await roleService.getAllRoles();
      expect(result).toEqual([]);
    });
  });

  describe("createRole", () => {
    it("should create a role with valid data", async () => {
      const role = await roleService.createRole({
        name: "Editor",
        description: "Can edit content",
      });

      expect(role.name).toBe("Editor");
      expect(role.description).toBe("Can edit content");
      expect(role.isActive).toBe(true);
    });

    it("should throw when name is missing", async () => {
      try {
        await roleService.createRole({ description: "No name" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/required/i);
      }
    });

    it("should throw on duplicate name", async () => {
      await roleService.createRole({ name: "Editor" });

      try {
        await roleService.createRole({ name: "Editor" });
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already exists/i);
      }
    });
  });

  describe("getRoleById", () => {
    it("should return role by id", async () => {
      const created = await Role.create({ name: "Viewer" });

      const result = await roleService.getRoleById(created._id.toString());
      expect(result.name).toBe("Viewer");
    });

    it("should throw on invalid ObjectId format", async () => {
      try {
        await roleService.getRoleById("not-a-valid-id");
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid/i);
      }
    });
  });

  describe("getRoleById — 404", () => {
    it("should throw 404 when role does not exist", async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      try {
        await roleService.getRoleById(nonExistentId);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });
  });

  describe("updateRole", () => {
    it("should update role name and description", async () => {
      const role = await Role.create({ name: "Original Role" });

      const updated = await roleService.updateRole(role._id.toString(), {
        name: "Updated Role",
        description: "new desc",
      });

      expect(updated.name).toBe("Updated Role");
      expect(updated.description).toBe("new desc");
    });

    it("should throw on invalid ObjectId", async () => {
      try {
        await roleService.updateRole("bad-id", { name: "X" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid/i);
      }
    });

    it("should throw 404 when role not found", async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      try {
        await roleService.updateRole(nonExistentId, { name: "X" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("should throw on duplicate name collision with another active role", async () => {
      await Role.create({ name: "Existing Role", isActive: true });
      const role = await Role.create({ name: "My Role", isActive: true });

      try {
        await roleService.updateRole(role._id.toString(), { name: "Existing Role" });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/already exists/i);
      }
    });

    it("should update permissions when provided", async () => {
      const perm = await Permission.create({
        name: "Edit Content",
        slug: "edit-content",
        module: "content",
        action: "edit",
        isActive: true,
      });
      const role = await Role.create({ name: "Content Role" });

      const updated = await roleService.updateRole(role._id.toString(), {
        permissions: [perm._id.toString()],
      });

      expect(updated.permissions).toHaveLength(1);
      expect(updated.permissions[0].slug).toBe("edit-content");
    });

    it("should throw when permissions list contains invalid/inactive permissions", async () => {
      const role = await Role.create({ name: "Perm Role" });
      const fakePermId = new mongoose.Types.ObjectId().toString();

      try {
        await roleService.updateRole(role._id.toString(), {
          permissions: [fakePermId],
        });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid or inactive/i);
      }
    });
  });

  describe("createRole with permissions", () => {
    it("should create role with valid permissions", async () => {
      const perm = await Permission.create({
        name: "View Reports",
        slug: "view-reports",
        module: "reports",
        action: "view",
        isActive: true,
      });

      const role = await roleService.createRole({
        name: "Report Viewer",
        permissions: [perm._id.toString()],
      });

      expect(role.permissions).toHaveLength(1);
      expect(role.permissions[0].slug).toBe("view-reports");
    });

    it("should throw when permissions list contains invalid ids", async () => {
      const fakePermId = new mongoose.Types.ObjectId().toString();

      try {
        await roleService.createRole({
          name: "Bad Perm Role",
          permissions: [fakePermId],
        });
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid or inactive/i);
      }
    });
  });

  describe("deleteRole", () => {
    it("should soft-delete by setting isActive to false", async () => {
      const role = await Role.create({ name: "Temp Role" });

      const result = await roleService.deleteRole(role._id.toString());
      expect(result.isActive).toBe(false);

      const saved = await Role.findById(role._id);
      expect(saved.isActive).toBe(false);
    });

    it("should throw when admins are using the role", async () => {
      const role = await Role.create({ name: "Admin Role" });

      await Admin.create({
        firstName: "John",
        lastName: "Doe",
        phone: "1234567890",
        email: "john@example.com",
        password: "hashedpassword",
        role: role._id,
        isActive: true,
      });

      try {
        await roleService.deleteRole(role._id.toString());
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/assigned to active admins/i);
      }
    });

    it("should throw 404 when role not found", async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      try {
        await roleService.deleteRole(nonExistentId);
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });

    it("should throw on invalid ObjectId", async () => {
      try {
        await roleService.deleteRole("invalid-id");
        fail("Expected error");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/invalid/i);
      }
    });
  });
});
