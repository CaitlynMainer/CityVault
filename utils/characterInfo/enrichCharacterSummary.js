const { getPowersetName } = require('./resolvePowersetName');
const { buildDisplayTitle } = require('./buildDisplayTitle');
const { getAlignment } = require('../alignment');
const { getAttributeMap } = require('../attributeMap');

function formatSeconds(sec) {
  if (!sec || isNaN(sec)) return 'Unknown';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

// Background picker
function getAlignmentBg(alignment) {
  const map = {
    hero: 'background',
    vigilante: 'background',
    villain: 'vil_background',
    rogue: 'vil_background',
    resistance: 'gold_background',
    loyalist: 'gold_background',
    unknown: 'vil_background',
    pvp: 'vil_background',
  };

  const normalized = (alignment || '').toLowerCase();
  const bgName = map[normalized] || 'background';
  return `images/backgrounds/${bgName}.png`;
}
function ucfirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function enrichCharacterSummary(character, serverKey) {
  const attributeMap = await getAttributeMap(serverKey);

  character.Level = (character.Level || 0) + 1;
  character.ClassName = ucfirst(attributeMap[character.Class]?.replace(/^class_/, '') || `Class ${character.Class}`);
  character.OriginName = attributeMap[character.Origin] || `Origin ${character.Origin}`;
  character.alignment = getAlignment(character.PlayerType, character.PlayerSubType, character.PraetorianProgress) || 'Unknown';
  character.PrimaryPowerset = getPowersetName(character.originalPrimary);
  character.SecondaryPowerset = getPowersetName(character.originalSecondary);
  character.DisplayTitle = buildDisplayTitle(character.TitleTheText, character.TitleCommon, character.TitleOrigin, character.TitleSpecial);
  character.TotalTimePlayed = formatSeconds(character.TotalTime);
  character.Created = character.DateCreated?.toISOString().split('T')[0] || 'Unknown';
  character.LastSeen = character.LastActive?.toISOString().split('T')[0] || 'Unknown';

  // Add background path based on alignment
  character.bgPath = getAlignmentBg(character.alignment);

  const requiredFields = {
    Level: character.Level,
    ClassName: character.ClassName,
    OriginName: character.OriginName,
    alignment: character.alignment,
    PrimaryPowerset: character.PrimaryPowerset,
    SecondaryPowerset: character.SecondaryPowerset,
    DisplayTitle: character.DisplayTitle,
    TotalTimePlayed: character.TotalTimePlayed,
    Created: character.Created,
    LastSeen: character.LastSeen
  };

  const missing = Object.entries(requiredFields)
    .filter(([_, value]) => value === undefined || value === null || value === '')
    .map(([key]) => key);

  if (missing.length) {
    //console.warn(`[ENRICH WARN] Missing values for character ${character.Name || '(unnamed)'} [${character.ContainerId}] on ${serverKey}:`, missing);
  }


  return character;
}

module.exports = { enrichCharacterSummary };
