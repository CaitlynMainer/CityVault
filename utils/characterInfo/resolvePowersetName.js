function getPowersetName(name) {
  if (!name) return '';
  const replacements = { Brawling: 'Street Justice', Gadgets: 'Devices' };
  const ats = ['Stalker', 'Brute', 'Corruptor', 'Mastermind', 'Dominator'];
  let clean = name;
  if (replacements[clean]) clean = replacements[clean];
  for (const at of ats) {
    const re = new RegExp(at, 'i');
    clean = clean.replace(re, '');
  }
  return clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}
module.exports = { getPowersetName };
