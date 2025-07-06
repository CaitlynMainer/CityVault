module.exports = {
  ROLES: {
    USER: 'user',
    GM: 'gm',
    ADMIN: 'admin'
  },

  isUser(role) {
    return role === 'user';
  },

  isGM(role) {
    return role === 'gm' || role === 'admin';
  },

  isAdmin(role) {
    return role === 'admin';
  }
};
