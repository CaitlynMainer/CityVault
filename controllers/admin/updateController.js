const path = require('path');
const fs = require('fs');
const { https } = require('follow-redirects'); // npm install follow-redirects
const unzipper = require('unzipper');
const { exec } = require('child_process');
const { finished } = require('stream');

async function downloadAndExtractUpdate(req, res) {
  const zipUrl = req.body.zipUrl;
  console.log('[Update] Downloading from:', zipUrl);

  if (!zipUrl || !zipUrl.endsWith('.zip')) {
    return res.status(400).send('Invalid zip URL');
  }

  const tmpPath = path.join(global.BASE_DIR, 'tmp_update.zip');
  const file = fs.createWriteStream(tmpPath);

  https.get(zipUrl, (response) => {
    response.pipe(file);

    finished(file, async (err) => {
      if (err) {
        console.error('[Update] Download stream error:', err);
        return res.status(500).send('Download failed.');
      }

      try {
        console.log('[Update] Download complete. Cleaning old files...');

        const keepDirs = new Set(['data', 'public', 'node_modules', 'sessions']);
        const keepFiles = new Set(['tmp_update.zip']);

        fs.readdirSync(global.BASE_DIR).forEach(entry => {
          if (keepDirs.has(entry) || keepFiles.has(entry)) {
            console.log(`[Update] Preserved: ${entry}`);
            return;
          }

          const fullPath = path.join(global.BASE_DIR, entry);

          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log('[Update] Removed:', entry);
          } catch (err) {
            if (err.code === 'EBUSY' || err.code === 'EPERM') {
              console.warn(`[Update] Skipped locked or protected: ${entry}`);
            } else {
              throw err;
            }
          }
        });

        console.log('[Update] Extracting update...');
        await fs.createReadStream(tmpPath)
          .pipe(unzipper.Extract({ path: global.BASE_DIR }))
          .promise();

        console.log('[Update] Extraction complete. Running npm install...');
        exec('npm install', { cwd: global.BASE_DIR }, (err, stdout, stderr) => {
          if (err) {
            console.error('[Update] npm install failed:', err);
            return res.status(500).send('Update extracted, but npm install failed.');
          }

          console.log('[Update] npm install complete.');
          console.log(stdout);

          // Clean up the temp ZIP
          try {
            fs.unlinkSync(tmpPath);
            console.log('[Update] Cleaned up tmp_update.zip');
          } catch (err) {
            console.warn('[Update] Could not delete tmp_update.zip:', err.message);
          }

          res.send('Update downloaded, extracted, and npm install completed. Please restart the server.');
        });
      } catch (extractErr) {
        console.error('[Update] Extraction failed:', extractErr);
        res.status(500).send('Extraction failed.');
      }
    });
  }).on('error', (err) => {
    console.error('[Update] Download error:', err);
    res.status(500).send('Download failed.');
  });
}

module.exports = {
  downloadAndExtractUpdate
};
