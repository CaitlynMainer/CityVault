const path = require('path');
const fs = require('fs/promises');
const tga2png = require('tga2png');

const portraitDir = path.join(global.BASE_DIR, 'public', 'images', 'portrait');

exports.servePortrait = async (req, res) => {
  const filename = path.basename(req.params.filename);

  const customPath = path.join(portraitDir, `${filename}_custom.png`);
  const pngPath = path.join(portraitDir, `${filename}.png`);
  const tgaPath = path.join(portraitDir, `${filename}.tga`);

  // 1. Try slot-specific custom override
  try {
    await fs.access(customPath);
    console.log(`[INFO] Serving slot-specific custom portrait: ${customPath}`);
    return res.sendFile(customPath);
  } catch {}

  // 2. Fallback: try base custom (e.g., victory_6034_custom.png for victory_6034_3)
  const match = filename.match(/^(.+)_\d+$/);
  if (match) {
    const baseCustomPath = path.join(portraitDir, `${match[1]}_custom.png`);
    try {
      await fs.access(baseCustomPath);
      return res.sendFile(baseCustomPath);
    } catch {}
  }

  // 3. Try existing PNG
  try {
    await fs.access(pngPath);
    return res.sendFile(pngPath);
  } catch {}

  // 4. Try converting TGA
  try {
    await fs.access(tgaPath);
    const tgaBuffer = await fs.readFile(tgaPath);

    const pngBuffer = await tga2png(tgaBuffer);
    await fs.writeFile(pngPath, pngBuffer);
    await fs.unlink(tgaPath); // Delete .tga after conversion

    console.log(`[CONVERT] ${filename}.tga → ${filename}.png (TGA deleted)`);
    return res.type('png').send(pngBuffer);
  } catch (err) {
    console.warn(`[MISS] Portrait not found or conversion failed: ${filename}`, err.message);
    return res.status(404).send('Not found');
  }
};
