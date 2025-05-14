const path = require('path');
const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');
const { exec } = require('child_process');

async function downloadAndExtractUpdate(req, res) {
  const zipUrl = req.body.zipUrl;
  if (!zipUrl || !zipUrl.endsWith('.zip')) {
    return res.status(400).send('Invalid zip URL');
  }

  const tmpPath = path.join(global.BASE_DIR, 'tmp_update.zip');

  const file = fs.createWriteStream(tmpPath);
  https.get(zipUrl, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close(async () => {
        try {
          console.log('[Update] Download complete. Extracting...');

          // Extract to current directory
          await fs.createReadStream(tmpPath)
            .pipe(unzipper.Extract({ path: global.BASE_DIR }))
            .promise();

          console.log('[Update] Extraction complete. Running npm install...');

          // Run npm install
          exec('npm install', { cwd: global.BASE_DIR }, (err, stdout, stderr) => {
            if (err) {
              console.error('[Update] npm install failed:', err);
              return res.status(500).send('Update extracted, but npm install failed.');
            }

            console.log('[Update] npm install complete.');
            console.log(stdout);
            fs.unlinkSync(tmpPath); // Cleanup
            res.send('Update downloaded, extracted, and npm install completed. Please restart the server.');
          });
        } catch (extractErr) {
          console.error('[Update] Extraction failed:', extractErr);
          res.status(500).send('Extraction failed.');
        }
      });
    });
  }).on('error', (err) => {
    console.error('[Update] Download error:', err);
    res.status(500).send('Download failed.');
  });
}

module.exports = {
  downloadAndExtractUpdate
};
