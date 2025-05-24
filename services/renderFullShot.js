const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { checkCostumeHash, updateCostumeHash } = require(global.BASE_DIR + '/utils/costumeHash');
const config = require(global.BASE_DIR + '/utils/config');

function defaultScale(scaleArray) {
  return Array.isArray(scaleArray) && scaleArray.length === 3 ? scaleArray : [0, 0, 0];
}

async function renderFullShot(pool, serverKey, containerId, slotId = 0, costumeDataFetcher, force = false) {
  const renderingCfg = config.costumeRendering;

  if (!renderingCfg || !renderingCfg.enabled || !renderingCfg.outputPath || !renderingCfg.renderOutputPath) {
    console.log('[SKIP] Costume rendering is disabled or misconfigured.');
    return;
  }

  const costume = await costumeDataFetcher(pool, containerId, slotId);
  if (!costume || !costume.appearance || !Array.isArray(costume.pieces)) return;

  const appearance = costume.appearance;
  const skinColorInt = appearance.ColorSkin + 16777216;
  const bodyType = appearance.BodyType ?? 0;

  const zoom = bodyType === 1 ? 26 : (bodyType === 0 ? 30 : 32);
  const theThing = slotId === 0 ? '' : `_${slotId}`;
  const filename = `${serverKey}_${containerId}${theThing}`;
  const imageOutName = `${filename}.tga`;

  const renderOutputPath = path.join(renderingCfg.renderOutputPath, imageOutName);
  const csvOutPath = path.join(renderingCfg.outputPath, `${filename}.csv`);

  let outstring =
    `PARAMS: X=200,Y=400\n` +
    `PARAMS: CX=2,CY=3,CZ=${zoom}\n` +
    `PARAMS: DELETECSV\n` +
    `PARAMS: OUTPUTNAME=${renderOutputPath}\r\n`;

  // Default 25 rows
  const rows = Array.from({ length: 25 }, (_, idx) => ({
    idx,
    geom: "none",
    tex1: "none",
    tex2: "none",
    displayName: "None",
    color1: 0,
    color2: 0,
    fxName: "none",
    color3: 0,
    color4: 0,
    region: "none",
    bodySet: "none"
  }));

  // Inject costume pieces
  for (const piece of costume.pieces) {
    const idx = piece.PartIndex ?? 0;
    if (idx < 0 || idx >= 25) continue;

    rows[idx] = {
      idx,
      geom: piece.Geom || "none",
      tex1: piece.Tex1 || "none",
      tex2: piece.Tex2 || "none",
      displayName: "None",
      color1: piece.Color1 ?? 0,
      color2: piece.Color2 ?? 0,
      fxName: piece.FxName || "none",
      color3: piece.Color3 ?? 0,
      color4: piece.Color4 ?? 0,
      region: piece.Region || "none",
      bodySet: piece.BodySet || "none"
    };
  }

  // Append rows to CSV
  for (const row of rows) {
    const csvRow = [
      row.idx,
      `"${row.geom ?? 0}"`,
      `"${row.tex1 ?? 0}"`,
      `"${row.tex2 ?? 0}"`,
      `"${row.displayName ?? 0}"`,
      `"${row.color1 ?? 0}"`,
      `"${row.color2 ?? 0}"`,
      bodyType,
      skinColorInt,
      appearance.BodyScale ?? 0,
      0,
      0,
      appearance.ShoulderScale ?? 0,
      appearance.ChestScale ?? 0,
      appearance.WaistScale ?? 0,
      appearance.HipScale ?? 0,
      appearance.LegScale ?? 0,
      0,
      ...defaultScale(appearance.HeadScales),
      ...defaultScale(appearance.BrowScales),
      ...defaultScale(appearance.CheekScales),
      ...defaultScale(appearance.ChinScales),
      ...defaultScale(appearance.CraniumScales),
      ...defaultScale(appearance.JawScales),
      ...defaultScale(appearance.NoseScales),
      `"${row.fxName}"`,
      row.color3,
      row.color4,
      `"${row.region}"`,
      `"${row.bodySet}"`
    ];

    outstring += csvRow.join(',') + '\r\n';
  }

  const hash = crypto.createHash('md5').update(outstring).digest('hex');
  const hashKey = `${slotId}_body`;

  const isSame = await checkCostumeHash(pool, serverKey, containerId, hashKey, hash);
  if (isSame && !force) {
    console.log('[SKIP] Costume unchanged, skipping write.');
    return;
  }

  await updateCostumeHash(pool, serverKey, containerId, hashKey, hash);

  await fs.mkdir(path.dirname(csvOutPath), { recursive: true });
  await fs.writeFile(csvOutPath, outstring);
  console.log(`[INFO] Costume CSV written: ${csvOutPath}`);
  console.log(`[NOTE] TGA OUTPUTNAME in CSV set to: ${renderOutputPath}`);
}

module.exports = { renderFullShot };
