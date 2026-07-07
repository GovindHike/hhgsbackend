import mongoose from "mongoose";
import { env } from "./env.js";

const ensureAssetIdIndexCompatibility = async () => {
  const assetsCollection = mongoose.connection.collection("assets");
  const indexes = await assetsCollection.indexes();
  const uniqueAssetIdIndex = indexes.find(
    (index) => index?.name === "uniqueAssetId_1" && index?.unique === true
  );

  if (!uniqueAssetIdIndex) {
    return;
  }

  await assetsCollection.dropIndex("uniqueAssetId_1");
  await assetsCollection.createIndex({ uniqueAssetId: 1 }, { unique: false, name: "uniqueAssetId_1" });
  console.log("Dropped legacy unique index on assets.uniqueAssetId and recreated it as non-unique.");
};

export const connectDatabase = async () => {
  await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== "production"
  });

  await ensureAssetIdIndexCompatibility();
};
