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
  return character;
}

module.exports = { enrichCharacterSummary };
