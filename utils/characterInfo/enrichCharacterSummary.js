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

function enrichCharacterSummary(character, serverKey) {
  const attributeMap = getAttributeMap(serverKey);

  character.Level = (character.Level || 0) + 1;
  character.ClassName = attributeMap[character.Class]?.replace(/^Class_/, '') || `Class ${character.Class}`;
  character.OriginName = attributeMap[character.Origin] || `Origin ${character.Origin}`;
  character.alignment = getAlignment(character.PlayerType, character.PlayerSubType, character.PraetorianProgress);
  character.PrimaryPowerset = getPowersetName(character.originalPrimary);
  character.SecondaryPowerset = getPowersetName(character.originalSecondary);
  character.DisplayTitle = buildDisplayTitle(character.TitleTheText, character.TitleCommon, character.TitleOrigin, character.TitleSpecial);
  character.TotalTimePlayed = formatSeconds(character.TotalTime);
  character.Created = character.DateCreated?.toISOString().split('T')[0] || 'Unknown';
  character.LastSeen = character.LastActive?.toISOString().split('T')[0] || 'Unknown';

  // Add background path based on alignment
  character.bgPath = getAlignmentBg(character.alignment);

  return character;
}

module.exports = { enrichCharacterSummary };
