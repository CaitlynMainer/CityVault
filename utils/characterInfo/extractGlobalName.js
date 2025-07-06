function extractGlobalName(dataBlob) {
  if (!dataBlob) return null;

  const lines = dataBlob.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('Name')) {
      return line.slice(4).trim().replace(/"/g, '');
    }
  }

  return null;
}

module.exports = { extractGlobalName };
