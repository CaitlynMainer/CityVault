const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const configPath = path.join(global.BASE_DIR, '/data/manifest-config.json');
const gameDir = path.join(global.BASE_DIR, '/public/game');
const manifestPath = path.join(global.BASE_DIR, '/public/manifest.xml');

function showConfigPage(req, res) {
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath));
  }
  res.render('admin/manifest/config-manifest', { title: 'Manifest Configuration', config });
}

function saveConfig(req, res) {
  const { label, forumName, forumUrl, webpage, posterImage, profiles } = req.body;

  // Convert object of profiles into array (handles both indexed arrays and nested objects)
  const parsedProfiles = Array.isArray(profiles)
    ? profiles
    : Object.values(profiles || {});

  const config = {
    label,
    forumName,
    forumUrl,
    webpage,
    posterImage,
    profiles: parsedProfiles
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    req.flash('success', 'Configuration saved.');
  } catch (err) {
    console.error('[Manifest Config Write Error]', err);
    req.flash('error', 'Failed to save configuration.');
  }

  req.session.save(() => {
    res.redirect('/admin/manifest');
  });
}



function generateManifest(req, res) {
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath));
  } else {
    req.flash('error', 'No config found.');
    return res.redirect('/admin/manifest');
  }

  const dateStr = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
  let xml = `<?xml version="1.0" ?>
<manifest>
  <label>${config.label || 'CityVault'}</label>
  <version>${dateStr}</version>
  <profiles>
`;

  for (const profile of config.profiles || []) {
    xml += `    <launch exec="${profile.exec}" order="${profile.order}" params="${profile.params}">${profile.name}</launch>
`;
  }

  xml += `  </profiles>
  <filelist>
`;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(gameDir, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      walk(fullPath);
    } else {
      const fileData = fs.readFileSync(fullPath);
      const md5 = crypto.createHash('md5').update(fileData).digest('hex');
      const size = fs.statSync(fullPath).size;
      
      const baseUrl = (config.webpage?.replace(/\/+$/, '').replace(/^https:/, 'http:')) || 'http://localhost:3000';
      const fileUrl = `${baseUrl}/game/${relPath}`;

      xml += `    <file name="${relPath}" size="${size}" md5="${md5}">
`;
      xml += `      <url>${fileUrl}</url>
`;
      xml += `    </file>
`;
    }
  }
}


  walk(gameDir);

  xml += `  </filelist>
  <forums>
    <forum name="${config.forumName}" url="${config.forumUrl}" />
  </forums>
  <webpage>${config.webpage}</webpage>
  <poster_image url="${config.posterImage}" />
</manifest>`;

  fs.writeFileSync(manifestPath, xml);
  req.flash('success', 'Manifest generated.');
  res.redirect('/admin/manifest');
}

module.exports = {
  showConfigPage,
  saveConfig,
  generateManifest
};
