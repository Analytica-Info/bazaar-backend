require("../setup");
const mongoose = require("mongoose");
const BaseRepository = require("../../src/repositories/BaseRepository");

const TestSchema = new mongoose.Schema(
  { name: { type: String, required: true }, score: Number, tag: String },
  { timestamps: true }
);
const TestModel = mongoose.models.RepoTest || mongoose.model("RepoTest", TestSchema);

describe("BaseRepository", () => {
  let repo;
  beforeEach(() => {
    repo = new BaseRepository(TestModel);
  });

  test("rejects construction without a model", () => {
    expect(() => new BaseRepository(null)).toThrow();
  });

  test("create returns a plain object", async () => {
    const created = await repo.create({ name: "alice", score: 1 });
    expect(created.name).toBe("alice");
    expect(created.score).toBe(1);
    expect(typeof created._id).not.toBe("undefined");
  });

  test("findById returns lean by default", async () => {
    const created = await repo.create({ name: "bob", score: 2 });
    const found = await repo.findById(created._id);
    expect(found.name).toBe("bob");
    // lean docs have no .save method
    expect(typeof found.save).toBe("undefined");
  });

  test("findById with lean: false returns hydrated document", async () => {
    const created = await repo.create({ name: "carol", score: 3 });
    const doc = await repo.findById(created._id, { lean: false });
    expect(typeof doc.save).toBe("function");
  });

  test("find applies sort, skip, limit", async () => {
    await repo.create({ name: "a", score: 1 });
    await repo.create({ name: "b", score: 2 });
    await repo.create({ name: "c", score: 3 });

    const items = await repo.find({}, { sort: { score: -1 }, limit: 2 });
    expect(items).toHaveLength(2);
    expect(items[0].score).toBe(3);
    expect(items[1].score).toBe(2);
  });

  test("count returns total matching", async () => {
    await repo.create({ name: "x", tag: "t1" });
    await repo.create({ name: "y", tag: "t1" });
    await repo.create({ name: "z", tag: "t2" });

    expect(await repo.count({ tag: "t1" })).toBe(2);
    expect(await repo.count({ tag: "missing" })).toBe(0);
  });

  test("exists returns boolean", async () => {
    await repo.create({ name: "eve" });
    expect(await repo.exists({ name: "eve" })).toBe(true);
    expect(await repo.exists({ name: "no-such" })).toBe(false);
  });

  test("updateById returns the new value and runs validators", async () => {
    const created = await repo.create({ name: "frank" });
    const updated = await repo.updateById(created._id, { score: 99 });
    expect(updated.score).toBe(99);
    // Run validators by default — required field cannot be unset
    await expect(repo.updateById(created._id, { name: null })).rejects.toThrow();
  });

  test("updateMany applies to all matching", async () => {
    await repo.create({ name: "g1", tag: "t" });
    await repo.create({ name: "g2", tag: "t" });
    const res = await repo.updateMany({ tag: "t" }, { $set: { score: 7 } });
    expect(res.modifiedCount).toBe(2);
  });

  test("deleteById removes the document", async () => {
    const created = await repo.create({ name: "del" });
    await repo.deleteById(created._id);
    expect(await repo.findById(created._id)).toBeNull();
  });

  test("deleteMany removes by filter", async () => {
    await repo.create({ name: "d1", tag: "rm" });
    await repo.create({ name: "d2", tag: "rm" });
    const res = await repo.deleteMany({ tag: "rm" });
    expect(res.deletedCount).toBe(2);
  });

  test("rawModel returns the underlying Mongoose model", () => {
    expect(repo.rawModel()).toBe(TestModel);
  });
});
