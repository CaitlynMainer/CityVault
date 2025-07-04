const path = require('path');
const fs = require('fs-extra');
const { https } = require('follow-redirects');
const { finished } = require('stream');
const AdmZip = require('adm-zip');
const { spawn, exec } = require('child_process');
		
async function downloadAndExtractUpdate(req, res) {
  const zipUrl = req.body.zipUrl;
  console.log('[Update] Downloading from:', zipUrl);

  if (!zipUrl || !zipUrl.endsWith('.zip')) {
    return res.status(400).send('Invalid zip URL');
  }

  const tmpPath = path.join(global.BASE_DIR, 'tmp_update.zip');
  const tmpExtractDir = path.join(global.BASE_DIR, 'tmpExtract');
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

        const keepDirs = new Set(['data', 'public', 'node_modules', 'sessions', 'userContent', 'ImageServer', '.git', '.github']);
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

        console.log('[Update] Extracting update to temp folder...');
		const zip = new AdmZip(tmpPath);
		zip.extractAllTo(tmpExtractDir, true); // true = overwrite


        console.log('[Update] Copying update into base dir (excluding /data)...');
        await fs.copy(tmpExtractDir, global.BASE_DIR, {
          filter: (src) => {
            const rel = path.relative(tmpExtractDir, src);
            if (rel === 'data' || rel.startsWith('data' + path.sep)) {
              console.log(`[Update] Skipping: ${rel}`);
              return false;
            }
            return true;
          }
        });

        console.log('[Update] Cleaning up temp extract...');
        await fs.remove(tmpExtractDir);
		
		console.log('[Update] Running npm install in launcher/...');
		const launcherPath = path.join(global.BASE_DIR, 'launcher');
		exec('npm install', { cwd: launcherPath }, (err, stdout, stderr) => {
		  if (err) {
			console.error('[Update] launcher npm install failed:', err);
		  } else {
			console.log('[Update] launcher npm install complete.');
			console.log(stdout);
		  }
		});

        console.log('[Update] Running npm install...');
		exec('npm install', { cwd: global.BASE_DIR }, (err, stdout, stderr) => {
		  if (err) {
			console.error('[Update] npm install failed:', err);
			return res.status(500).send('Update extracted, but npm install failed.');
		  }

		  console.log('[Update] npm install complete.');
		  console.log(stdout);

		  try {
			fs.unlinkSync(tmpPath);
			console.log('[Update] Cleaned up tmp_update.zip');
		  } catch (err) {
			console.warn('[Update] Could not delete tmp_update.zip:', err.message);
		  }

		  // Send redirect BEFORE exiting
		  res.redirect('/'); // Or your desired path

		  // Delay just enough to let the response flush
		  setTimeout(() => {
			console.log('[Update] Relaunching application...');
			const nodePath = process.execPath;
			const child = spawn('npm', ['start'], {
			  cwd: global.BASE_DIR,
			  detached: true,
			  stdio: 'ignore',
			  shell: true // required on Windows to locate npm
			});

			child.unref();
			process.exit(0);
		  }, 500); // Small delay to allow redirect to be sent
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
