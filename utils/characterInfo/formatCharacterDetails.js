const { buildDisplayTitle } = require('./buildDisplayTitle');
const { getPowersetName } = require('./resolvePowersetName');

function formatSeconds(sec) {
  if (!sec || isNaN(sec)) return 'Unknown';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function enrichCharacter(character) {
  character.Level += 1;
  character.Experience = character.ExperiencePoints?.toLocaleString() || 'Unknown';
  character.Influence = character.InfluencePoints?.toLocaleString() || 'Unknown';
  character.TotalTimePlayed = formatSeconds(character.TotalTime);
  character.LastSeen = character.LastActive?.toISOString().split('T')[0] || 'Unknown';
  character.Created = character.DateCreated?.toISOString().split('T')[0] || 'Unknown';
  character.LoginCount = character.LoginCount || 0;
  character.PrimaryPowerset = getPowersetName(character.originalPrimary);
  character.SecondaryPowerset = getPowersetName(character.originalSecondary);
  character.DisplayTitle = buildDisplayTitle(
    character.TitleTheText,
    character.TitleCommon,
    character.TitleOrigin,
    character.TitleSpecial
  );
  return character;
}

module.exports = { enrichCharacter };
