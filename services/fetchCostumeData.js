const sql = require('mssql');

async function fetchCostumeData(pool, containerId, slotId, force = false) {
  const costume = {
    appearance: {},
    pieces: [],
    source: ''
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
  let usingI25 = false;
  let costumesTableExists = false;

  try {
    await pool.request().query('SELECT TOP 1 * FROM dbo.Costumes');
    costumesTableExists = true;
  } catch {
    costumesTableExists = false;
  }

  // Only query dbo.Costumes if there is data for the costume in it
  if (costumesTableExists) {
    const i25Result = await pool.request()
      .input('cid', sql.Int, containerId)
      .input('slot', sql.Int, slotValue)
      .query(`
        SELECT PartIndex,
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
        ORDER BY PartIndex ASC
      `);

    if (i25Result.recordset.length > 0) {
      pieces = i25Result.recordset;
      costume.source = 'dbo.Costumes';
      usingI25 = true;
    }
  }

  // Fallback: dbo.CostumeParts used in i25-style flat exports or legacy format
  if (!usingI25) {
    const fallbackResult = await pool.request()
      .input('cid', sql.Int, containerId)
      .input('slot', sql.Int, slotValue)
      .query(`
        SELECT
          SubId,
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
          AND (CostumeNum = @slot OR (CostumeNum IS NULL AND @slot IS NULL) OR (CostumeNum = 0 AND @slot IS NULL))
        ORDER BY SubId ASC
      `);

    // Remap SubId relative to base costume row (i.e., modulo 30)
    pieces = fallbackResult.recordset.map((p, index) => ({
      ...p,
      PartIndex: p.SubId - ((slotValue ?? 0) * 30)
    }));

    costume.source = 'dbo.CostumeParts';
  }

  console.log(`[DEBUG] Loaded ${pieces.length} parts from ${costume.source}`);

  pieces = pieces.filter(p => {
    const region = (p.Region ?? '').toLowerCase();
    const fx = (p.FxName ?? '').toLowerCase();
    return region !== 'special' && (fx === 'none' || !fx.includes('auras/'));
  });

  costume.pieces = pieces.map(p => ({
    PartIndex: p.PartIndex ?? 0,
    Geom: p.Geom ?? 'none',
    Tex1: p.Tex1 ?? 'none',
    Tex2: p.Tex2 ?? 'none',
    DisplayName: p.DisplayName ?? null,
    Region: p.Region ?? 'none',
    BodySet: p.BodySet ?? 'none',
    Color1: p.Color1 ?? 0,
    Color2: p.Color2 ?? 0,
    FxName: p.FxName ?? 'none',
    Color3: p.Color3 ?? 0,
    Color4: p.Color4 ?? 0
  }));

  console.log(`[fetchCostumeData] ContainerId=${containerId} Slot=${slotId} Source=${costume.source}`);
  return costume;
}

module.exports = { fetchCostumeData };
