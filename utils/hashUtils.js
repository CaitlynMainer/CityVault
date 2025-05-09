const crypto = require('crypto');

function adler32(str) {
  const MOD_ADLER = 65521;
  let a = 1, b = 0;
  for (let i = 0; i < str.length; i++) {
    a = (a + str.charCodeAt(i)) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return (b << 16) | a;
}

function gameHashPassword(authname, password) {
    authname = authname.toLowerCase();
    const a32 = adler32(authname);
    const a32hex = a32.toString(16).padStart(8, '0');
    const rearranged = a32hex.slice(6, 8) + a32hex.slice(4, 6) + a32hex.slice(2, 4) + a32hex.slice(0, 2);
    const digest = crypto.createHash('sha512').update(password + rearranged, 'utf8').digest();
    return digest; // already a Buffer
  }

module.exports = { gameHashPassword };