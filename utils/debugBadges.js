const { loadAllBadgeData } = require('./badgeDataCache');
const { getOwnedBadgesFromBitfield } = require('./badgeParser');
const fs = require('fs');
const path = require('path');

function debugBadgeDiscrepancies(hexBitfield) {
  const { attributeMap, detailsMap } = loadAllBadgeData();
  const ownedBadges = getOwnedBadgesFromBitfield(hexBitfield);
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
