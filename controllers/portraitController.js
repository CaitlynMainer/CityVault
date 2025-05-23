const path = require('path');
const fs = require('fs/promises');
const tga2png = require('tga2png');

const portraitDir = path.join(global.BASE_DIR, 'public', 'images', 'portrait');

exports.servePortrait = async (req, res) => {
  const filename = path.basename(req.params.filename);
  console.log(`[DEBUG] Hit portrait route for: ${filename}.png`);

  const pngPath = path.join(portraitDir, `${filename}.png`);
  const tgaPath = path.join(portraitDir, `${filename}.tga`);

  try {
    await fs.access(pngPath);
    return res.sendFile(pngPath);
  } catch {}

  try {
    await fs.access(tgaPath);
    const tgaBuffer = await fs.readFile(tgaPath);

    const pngBuffer = await tga2png(tgaBuffer);
    await fs.writeFile(pngPath, pngBuffer);
    await fs.unlink(tgaPath); // Remove the .tga after successful conversion

    console.log(`[CONVERT] ${filename}.tga → ${filename}.png (TGA deleted)`);
    return res.type('png').send(pngBuffer);
  } catch (err) {
    console.warn(`[MISS] Portrait not found or conversion failed: ${filename}`, err.message);
    return res.status(404).send('Not found');
  }
};
