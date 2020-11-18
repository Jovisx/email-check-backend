module.exports = {
  env: {
    node: true,
    es6: true
  },
  extends: ['standard'],
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module'
  },
  rules: {
    semi: ['error', 'always']
  }
};
