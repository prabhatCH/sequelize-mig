import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import Sequelize from 'sequelize';

const { dirname: _dirname, join } = path;
const dirname = _dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { DataTypes } = Sequelize;

export const getColumnTypeNameBase = (attrName, attrObj, options) => {
  switch (attrName) {
    // CHAR(length, binary)
    case DataTypes.CHAR.key:
      if (options.binary) return `CHAR.BINARY`;
      return `CHAR(${options.length})`;

    // STRING(length, binary).BINARY
    case DataTypes.STRING.key:
      return `STRING${options.length ? `(${options.length})` : ''}${
        options.binary ? '.BINARY' : ''
      }`;

    // TEXT(length)
    case DataTypes.TEXT.key:
      if (!options.length) return `TEXT`;
      if (typeof options.length === 'string') return `TEXT("${options.length.toLowerCase()}")`;
      return `TEXT(${options.length.toLowerCase()})`;

    // NUMBER(length, decimals).UNSIGNED.ZEROFILL
    case DataTypes.DOUBLE.key:
      attrName = 'DOUBLE';
    // falls through

    case DataTypes.NUMBER.key:
    case DataTypes.TINYINT.key:
    case DataTypes.SMALLINT.key:
    case DataTypes.MEDIUMINT.key:
    case DataTypes.BIGINT.key:
    case DataTypes.FLOAT.key:
    case DataTypes.REAL.key:
    case DataTypes.DECIMAL.key:
    case DataTypes.INTEGER.key: {
      let ret = attrName;

      if (options.length) {
        ret += `(${options.length}`;
        if (options.decimals) ret += `, ${options.decimals}`;
        ret += ')';
      }

      if (options.precision) {
        ret += `(${options.precision}`;
        if (options.scale) ret += `, ${options.scale}`;
        ret += ')';
      }

      ret = [ret];

      if (options.zerofill) ret.push('ZEROFILL');
      if (options.unsigned) ret.push('UNSIGNED');

      return `${ret.join('.')}`;
    }

    case DataTypes.ENUM.key:
      return `ENUM('${options.values.join("', '")}')`;

    case DataTypes.BLOB.key:
      if (!options.length) return `BLOB`;
      if (typeof options.length === 'string') return `BLOB("${options.length.toLowerCase()}")`;
      return `BLOB(${options.length.toLowerCase()})`;

    case DataTypes.GEOMETRY.key:
      if (options.type) {
        if (options.srid) return `GEOMETRY('${options.type}', ${options.srid})`;
        return `GEOMETRY('${options.type}')`;
      }
      return 'GEOMETRY';

    case DataTypes.GEOGRAPHY.key:
      return 'GEOGRAPHY';

    case DataTypes.ARRAY.key: {
      const type = attrObj.toString();
      const match = type.match(/(\w+)\[\]/);
      const arrayType = match.length >= 1 ? `{prefix}${match[1]}` : '{prefix}STRING';
      return `ARRAY(${arrayType})`;
    }
    case DataTypes.RANGE.key:
      console.warn(`${attrName} type not supported, you should make it by`);
      return attrObj.toSql();

    // BOOLEAN, TIME, DATE, DATEONLY, HSTORE, JSONB
    // UUID, UUIDV1, UUIDV4, VIRTUAL, INET, MACADDR
    default:
      return attrName;
  }
};

export const getColumnTypeName = (col, prefix = 'Sequelize.') => {
  const attrName = typeof col.type.key === 'undefined' ? col.type : col.type.key;
  const attrObj = col.type;
  const options = col.type.options ? col.type.options : {};

  const columnTypeName = getColumnTypeNameBase(attrName, attrObj, options);

  return `${prefix}${columnTypeName.replace('{prefix}', prefix)}`;
};

export const getDefaultValueType = (defaultValue, prefix = 'Sequelize.') => {
  if (typeof defaultValue === 'object' && defaultValue.constructor && defaultValue.constructor.name)
    return { internal: true, value: prefix + defaultValue.constructor.name };

  if (typeof defaultValue === 'function') return { notSupported: true, value: '' };

  return { value: defaultValue };
};

export const sortActions = (actions) => {
  const orderedActionTypes = [
    'removeIndex',
    'removeColumn',
    'dropTable',
    'createTable',
    'addColumn',
    'changeColumn',
    'addIndex',
  ];

  // test
  // actions = shuffleArray(actions);

  actions.forEach((a) => {
    if (!a.depends) a.depends = [];
  });

  actions.sort((a, b) => {
    if (orderedActionTypes.indexOf(a.actionType) < orderedActionTypes.indexOf(b.actionType))
      return -1;
    if (orderedActionTypes.indexOf(a.actionType) > orderedActionTypes.indexOf(b.actionType))
      return 1;

    if (a.depends.length === 0 && b.depends.length > 0) return -1; // a < b
    if (b.depends.length === 0 && a.depends.length > 0) return 1; // b < a

    return 0;
  });

  for (let k = 0; k <= actions.length; k++) {
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.depends.length !== 0) {
        for (let j = 0; j < actions.length; j++) {
          const b = actions[j];
          if (
            b.depends.length !== 0 &&
            a.actionType === b.actionType &&
            b.depends.indexOf(a.tableName) !== -1 &&
            i > j
          ) {
            const c = actions[i];
            actions[i] = actions[j];
            actions[j] = c;
          }
        }
      }
    }
  }

  // remove duplicate changeColumns
  for (let i = 0; i < actions.length; i++) {
    if (JSON.stringify(actions[i]) === JSON.stringify(actions[i - 1])) actions.splice(i, 1);
  }
};

export const pathConfig = (options) => {
  let PWD = process.env.PWD ? process.env.PWD : process.cwd();
  if (options.pwdPath)
    PWD = options.pwdPath.slice(0, 2) === './' ? join(PWD, options.pwdPath) : options.pwdPath;

  let sequelizercPath = join(PWD, '.sequelizerc');
  if (options.sequelizercPath) sequelizercPath = join(PWD, options.sequelizercPath);

  // eslint-disable-next-line import/no-dynamic-require
  const sequelizerc = fs.existsSync(sequelizercPath) ? require(sequelizercPath) : [];

  const packageDir = join(PWD, 'package.json');

  let migrationsDir = join(PWD, 'migrations');
  let modelsDir = join(PWD, 'models');
  let stateDir = modelsDir;
  let indexDir;

  if (sequelizerc['models-path'] && !options.ignoreSequelizerc)
    modelsDir = sequelizerc['models-path'];
  if (sequelizerc['migrations-path'] && !options.ignoreSequelizerc)
    migrationsDir = sequelizerc['migrations-path'];

  indexDir = join(modelsDir, 'index.js');

  if (options.modelsPath) modelsDir = join(PWD, options.modelsPath);
  if (options.migrationsPath) migrationsDir = join(PWD, options.migrationsPath);
  if (options.indexFilePath) indexDir = join(PWD, options.indexFilePath);
  if (options.statePath) stateDir = join(PWD, options.statePath);

  return {
    modelsDir,
    migrationsDir,
    stateDir,
    indexDir,
    packageDir,
  };
};

export const readAsset = (assetPath) =>
  fs.readFileSync(join(dirname, './assets', assetPath)).toString();

// #region new method for sorting actions / NEEDS More TESTING
/*
  actions.sort((a, b) => {
    if (
      a.depends?.length !== 0 &&
      b.depends?.length !== 0 &&
      a.actionType === b.actionType &&
      b.depends?.indexOf(a.tableName) !== -1
    )
      return -1;
    return 0;
  });

  actions.forEach(() => {
    actions.forEach((a, i) => {
      if (a.depends?.length !== 0) {
        actions.forEach((b, j) => {
          if (
            b.depends?.length !== 0 &&
            a.actionType === b.actionType &&
            b.depends?.indexOf(a.tableName) !== -1 &&
            i > j
          ) {
            const temp = actions[i];
            actions[i] = actions[j];
            actions[j] = temp;
          }
        });
      }
    });
  });
 */
// #endregion
