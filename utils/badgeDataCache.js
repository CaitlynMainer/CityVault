const badgeAttributeMap = require('./badgeAttributeMap');
const { getAllBadges } = require('./badgeDetails');

let badgeCache = null;

function loadAllBadgeData() {
  if (!badgeCache) {
    const fullMeta = getAllBadges();
    badgeCache = {
      attributeMap: badgeAttributeMap,
      detailsMap: fullMeta
    };
  }

  return badgeCache;
}

module.exports = {
  loadAllBadgeData
};
