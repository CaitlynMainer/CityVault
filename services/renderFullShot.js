const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { checkCostumeHash, updateCostumeHash } = require(global.BASE_DIR + '/utils/costumeHash');
const config = require(global.BASE_DIR + '/utils/config');

function defaultScale(scaleArray) {
  return Array.isArray(scaleArray) && scaleArray.length === 3 ? scaleArray : [0, 0, 0];
}

async function renderFullShot(authPool, pool, serverKey, containerId, slotId = 0, costumeDataFetcher, force = false) {
  const renderingCfg = config.costumeRendering;

  if (!renderingCfg || !renderingCfg.enabled || !renderingCfg.outputPath || !renderingCfg.renderOutputPath) {
    return;
  }

  const safeSlotId = typeof slotId === 'number' && !isNaN(slotId) ? slotId : 0;

  const costume = await costumeDataFetcher(pool, containerId, safeSlotId);
  if (!costume || !costume.appearance || !Array.isArray(costume.pieces)) {
    console.warn('[WARN] Costume data incomplete or invalid.');
    return;
  }

  const appearance = costume.appearance;
  const skinColorInt = appearance.ColorSkin + 16777216;
  const bodyType = appearance.BodyType ?? 0;
  const zoom = bodyType === 1 ? 26 : (bodyType === 0 ? 30 : 32);

  const theThing = safeSlotId === 0 ? '' : `_${safeSlotId}`;
  const filename = `${serverKey}_${containerId}${theThing}`;
  const imageOutName = `${filename}.tga`;

  const renderOutputPath = path.join(renderingCfg.renderOutputPath, imageOutName);
  const csvOutPath = path.join(renderingCfg.outputPath, `${filename}.csv`);
  const portraitPath = path.join(global.BASE_DIR, 'public', 'images', 'portrait', `${filename}.png`);

  let outstring =
    `PARAMS: X=200,Y=400\n` +
    `PARAMS: CX=2,CY=3,CZ=${zoom}\n` +
    `PARAMS: DELETECSV\n` +
    `PARAMS: OUTPUTNAME=${renderOutputPath}\r\n`;

  const NUM_SLOTS = Math.max(60, ...costume.pieces.map(p => (p.PartIndex ?? 0) + 1));
  const rows = Array.from({ length: NUM_SLOTS }, (_, idx) => ({
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

  for (const piece of costume.pieces) {
    const idx = piece.PartIndex ?? 0;
    if (idx < 0 || idx >= rows.length) {
      console.warn(`[WARN] Skipping out-of-range piece index=${idx}`);
      continue;
    }

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
  
  //for (const piece of costume.pieces) {
  //console.log('[DEBUG] Piece', piece.PartIndex, piece.Geom, piece.Region, piece.BodySet);
  //}


  for (const row of rows) {
    const csvRow = [
      row.idx,
      `"${row.geom}"`,
      `"${row.tex1}"`,
      `"${row.tex2}"`,
      `"${row.displayName}"`,
      `"${row.color1}"`,
      `"${row.color2}"`,
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
  const hashKey = `${safeSlotId}_body`;

  const isSame = await checkCostumeHash(authPool, serverKey, containerId, hashKey, hash);

  if (isSame && !force) {
    return;
  }

  await updateCostumeHash(authPool, serverKey, containerId, hashKey, hash);

  try {
    await fs.unlink(portraitPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[WARN] Failed to delete old PNG: ${err.message}`);
    }
  }

  await fs.mkdir(path.dirname(csvOutPath), { recursive: true });
  await fs.writeFile(csvOutPath, outstring);
}

module.exports = { renderFullShot };
