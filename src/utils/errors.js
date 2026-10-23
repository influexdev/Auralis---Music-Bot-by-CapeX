// Thrown for expected, user-facing problems (bad input, missing permissions, ...).
class UserError extends Error {
  constructor(message, title = 'Command Error') {
    super(message);
    this.name = 'UserError';
    this.title = title;
  }
}

module.exports = { UserError };
