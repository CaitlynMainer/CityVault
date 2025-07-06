function extractGlobalName(dataBlob) {
  if (!dataBlob) return null;
  const lines = dataBlob.split('\n');
  for (const line of lines) {
    if (line.startsWith('Name')) {
      return line.replace('Name', '').replace(/"/g, '').trim();
    }
  }
  return null;
}
module.exports = { extractGlobalName };
