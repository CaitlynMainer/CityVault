const path = require('path');
const fs = require('fs/promises');
const tga2png = require('tga2png');

const portraitDir = path.join(global.BASE_DIR, 'public', 'images', 'portrait');

exports.convertAllPortraits = async () => {
  try {
    const files = await fs.readdir(portraitDir);

    for (const file of files) {
      if (file.toLowerCase().endsWith('.tga')) {
        const tgaPath = path.join(portraitDir, file);
        const pngPath = tgaPath.replace(/\.tga$/i, '.png');

        try {
          const tgaBuffer = await fs.readFile(tgaPath);
          const pngBuffer = await tga2png(tgaBuffer);

          await fs.writeFile(pngPath, pngBuffer);
          await fs.unlink(tgaPath); // Remove original .tga
          console.log(`[OK] Converted: ${file}`);
        } catch (err) {
          console.error(`[ERROR] Failed to convert ${file}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[FATAL] Unable to read portrait directory:', err.message);
  }
};
