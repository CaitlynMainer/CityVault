const { getAttributeMap } = require('./attributeMap');
const { getAllBadges } = require('./badgeDetails');
const { getOwnedBadgesFromBitfield } = require('./badgeParser');

async function debugBadgeDiscrepancies(hexBitfield, serverKey) {
  const attributeMap = await getAttributeMap(serverKey);
  const detailsMap = getAllBadges(serverKey);
  const ownedBadges = getOwnedBadgesFromBitfield(hexBitfield, serverKey);
  const ownedSet = new Set(ownedBadges.map(b => b.internalName));

  const all = Object.entries(detailsMap);

  const getMissing = (category) =>
    all
      .filter(([, b]) => b.Category === category)
      .map(([name]) => name)
      .filter(name => !ownedSet.has(name));

  return {
    tourism: getMissing('kTourism'),
    gladiator: getMissing('kGladiator')
  };
}

module.exports = { debugBadgeDiscrepancies };
