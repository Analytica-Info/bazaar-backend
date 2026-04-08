const mongoose = require("mongoose");

const syncStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    lastVersion: { type: String, default: "" },
    lastSyncAt: { type: Date, default: null },
    lastProductCount: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const SyncState = mongoose.model("SyncState", syncStateSchema);
module.exports = SyncState;
