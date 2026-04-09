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
  });
});
