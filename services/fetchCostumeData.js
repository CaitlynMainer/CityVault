const sql = require('mssql');

async function fetchCostumeData(pool, containerId, slotId, force = false) {
  const costume = {
    appearance: {},
    pieces: []
  };

  const slotValue = slotId === 0 ? null : slotId;

  // Fetch appearance
  const appearanceResult = await pool.request()
    .input('cid', sql.Int, containerId)
    .input('slot', sql.Int, slotId)
    .query(`
      SELECT BodyType, ColorSkin, BodyScale, BoneScale, HeadScale,
             ShoulderScale, ChestScale, WaistScale, HipScale, LegScale,
             0 AS ArmScale,
             HeadScales, BrowScales, CheekScales, ChinScales, CraniumScales,
             JawScales, NoseScales
      FROM dbo.Appearance
      WHERE ContainerId = @cid AND SubId = @slot
    `);

  if (appearanceResult.recordset.length > 0) {
    const row = appearanceResult.recordset[0];
    costume.appearance = {
      ...row,
      HeadScales: row.HeadScales || [0, 0, 0],
      BrowScales: row.BrowScales || [0, 0, 0],
      CheekScales: row.CheekScales || [0, 0, 0],
      ChinScales: row.ChinScales || [0, 0, 0],
      CraniumScales: row.CraniumScales || [0, 0, 0],
      JawScales: row.JawScales || [0, 0, 0],
      NoseScales: row.NoseScales || [0, 0, 0],
    };
  }

 let pieces = [];

  try {
    const costumeResult = await pool.request()
      .input('cid', sql.Int, containerId)
      .input('slot', sql.Int, slotValue)
      .query(`
        SELECT ISNULL(PartIndex, 0) AS PartIndex,
              att2.name AS Geom,
              att3.name AS Tex1,
              att4.name AS Tex2,
              att5.name AS DisplayName,
              att6.name AS Region,
              att7.name AS BodySet,
              Color1, Color2,
              att8.name AS FxName,
              Color3, Color4
        FROM dbo.Costumes
        LEFT JOIN dbo.Attributes att2 ON att2.Id = Geom
        LEFT JOIN dbo.Attributes att3 ON att3.Id = Tex1
        LEFT JOIN dbo.Attributes att4 ON att4.Id = Tex2
        LEFT JOIN dbo.Attributes att5 ON att5.Id = Costumes.Name
        LEFT JOIN dbo.Attributes att6 ON att6.Id = Costumes.Region
        LEFT JOIN dbo.Attributes att7 ON att7.Id = Costumes.BodySet
        LEFT JOIN dbo.Attributes att8 ON att8.Id = Costumes.FxName
        INNER JOIN dbo.Ents ON Ents.ContainerId = Costumes.ContainerId
        WHERE Costumes.ContainerId = @cid
          AND (Costume = @slot OR (Costume IS NULL AND @slot IS NULL) OR (Costume = 0 AND @slot IS NULL))
      `);

    if (costumeResult.recordset.length > 0) {
      pieces = costumeResult.recordset;
    } else {
      console.warn('[WARN] No entries in dbo.Costumes for this character. Falling back to CostumeParts.');

      const fallbackResult = await pool.request()
        .input('cid', sql.Int, containerId)
        .input('slot', sql.Int, slotValue)
        .query(`
          SELECT SubId % 60 AS PartIndex,
                att2.name AS Geom,
                att3.name AS Tex1,
                att4.name AS Tex2,
                att5.name AS DisplayName,
                att6.name AS Region,
                att7.name AS BodySet,
                Color1, Color2,
                att8.name AS FxName,
                Color3, Color4
          FROM dbo.CostumeParts
          LEFT JOIN dbo.Attributes att2 ON att2.Id = Geom
          LEFT JOIN dbo.Attributes att3 ON att3.Id = Tex1
          LEFT JOIN dbo.Attributes att4 ON att4.Id = Tex2
          LEFT JOIN dbo.Attributes att5 ON att5.Id = CostumeParts.Name
          LEFT JOIN dbo.Attributes att6 ON att6.Id = CostumeParts.Region
          LEFT JOIN dbo.Attributes att7 ON att7.Id = CostumeParts.BodySet
          LEFT JOIN dbo.Attributes att8 ON att8.Id = CostumeParts.FxName
          INNER JOIN dbo.Ents ON Ents.ContainerId = CostumeParts.ContainerId
          WHERE CostumeParts.ContainerId = @cid
            AND (CostumeNum = @slot OR (@slot IS NULL AND CostumeNum IS NULL))
        `);

      pieces = fallbackResult.recordset;
    }

  } catch (err) {
    if (err.message.includes("Invalid object name") && err.message.includes("Costumes")) {
      console.warn('[WARN] Costumes table missing, assuming i24 — using CostumeParts fallback');

      const fallbackResult = await pool.request()
        .input('cid', sql.Int, containerId)
        .input('slot', sql.Int, slotValue)
        .query(`
          SELECT SubId % 60 AS PartIndex,
                att2.name AS Geom,
                att3.name AS Tex1,
                att4.name AS Tex2,
                att5.name AS DisplayName,
                att6.name AS Region,
                att7.name AS BodySet,
                Color1, Color2,
                att8.name AS FxName,
                Color3, Color4
          FROM dbo.CostumeParts
          LEFT JOIN dbo.Attributes att2 ON att2.Id = Geom
          LEFT JOIN dbo.Attributes att3 ON att3.Id = Tex1
          LEFT JOIN dbo.Attributes att4 ON att4.Id = Tex2
          LEFT JOIN dbo.Attributes att5 ON att5.Id = CostumeParts.Name
          LEFT JOIN dbo.Attributes att6 ON att6.Id = CostumeParts.Region
          LEFT JOIN dbo.Attributes att7 ON att7.Id = CostumeParts.BodySet
          LEFT JOIN dbo.Attributes att8 ON att8.Id = CostumeParts.FxName
          INNER JOIN dbo.Ents ON Ents.ContainerId = CostumeParts.ContainerId
          WHERE CostumeParts.ContainerId = @cid
            AND (CostumeNum = @slot OR (@slot IS NULL AND CostumeNum IS NULL))
        `);
      pieces = fallbackResult.recordset;
    } else {
      throw err;
    }
  }



  // Build padded array using PartIndex directly
  const padded = Array.from({ length: 25 }, (_, i) => {
    const found = pieces.find(p => p.PartIndex === i);
    return {
      PartIndex: i,
      Geom: found?.Geom ?? 'none',
      Tex1: found?.Tex1 ?? 'none',
      Tex2: found?.Tex2 ?? 'none',
      DisplayName: found?.DisplayName ?? null,
      Region: found?.Region ?? 'none',
      BodySet: found?.BodySet ?? 'none',
      Color1: found?.Color1 ?? 0,
      Color2: found?.Color2 ?? 0,
      FxName: found?.FxName ?? 'none',
      Color3: found?.Color3 ?? 0,
      Color4: found?.Color4 ?? 0
    };
  });

  costume.pieces = padded;
  return costume;
}

module.exports = { fetchCostumeData };
