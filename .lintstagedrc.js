module.exports = {
  '*.{ts,tsx,js,jsx}': ['prettier --write', 'eslint --fix', () => 'npm run test:run'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};

