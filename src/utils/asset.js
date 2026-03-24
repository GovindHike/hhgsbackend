export const buildAssetNumber = async (AssetModel) => {
  const latestAsset = await AssetModel.findOne({}, { uniqueAssetId: 1 })
    .sort({ createdAt: -1 })
    .lean();

  const latestSequence = latestAsset?.uniqueAssetId
    ? Number(latestAsset.uniqueAssetId.split("-")[1])
    : 0;

  return `AST-${String(latestSequence + 1).padStart(5, "0")}`;
};
