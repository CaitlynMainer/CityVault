function getAlignment(playerType, playerSubType, praetorianProgress) {
  const pt = playerType != null ? Number(playerType) : null;
  const ps = playerSubType != null ? Number(playerSubType) : null;
  const pp = praetorianProgress != null ? Number(praetorianProgress) : null;

  if ((pt === null || pt === 0) && (ps === null || ps === 0) && (pp === null || pp === 3)) {
    return "Hero";
  }

  if (pt === 1 && (ps === null || ps === 0) && (pp === null || pp === 3)) {
    return "Villain";
  }

  if ((pt === null || pt === 0) && ps === 2) return "Vigilante";
  if (pt === 1 && ps === 2) return "Rogue";
  if ((pt === null || pt === 0) && pp === 2) return "Resistance";
  if (pt === 1 && pp === 2) return "Loyalist";
  if (pp === 7) return "PvP";
  if (pp === 6 || pp === 1) return "Unknown";
  return "Unknown";
}



module.exports = {
  getAlignment
};
