function buildDisplayTitle(thePrefix, common, origin, special) {
  if (special && special.trim()) return special.trim();
  const parts = [];
  if (thePrefix && thePrefix.trim()) parts.push(thePrefix.trim());
  if (common && common.trim()) parts.push(common.trim());
  if (origin && origin.trim()) parts.push(origin.trim());
  return parts.join(' ').trim();
}
module.exports = { buildDisplayTitle };
