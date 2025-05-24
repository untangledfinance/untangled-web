/**
 * Available modules to export.
 */
const modules: string[] = [
  'core',
  'types',
  'core/caching',
  'core/config',
  'core/context',
  'core/encoding',
  'core/http',
  'core/ioc',
  'core/jwt',
  'core/logging',
  'core/notify',
  'core/rbac',
  'core/scheduling',
  'core/storage',
  'core/tunneling',
  'core/types',
  'core/validation',
];

/**
 * Exported modules in `package.json` format.
 */
export default modules.reduce(
  (e, module) => {
    e[`./${module}`] = {
      import: `./dist/${module}/index.js`,
      types: `./dist/${module}/index.d.ts`,
    };
    return e;
  },
  {} as {
    /**
     * Path to module when importing.
     */
    [modulePath: string]: {
      /**
       * Path to exported file.
       */
      import: string;
      /**
       * Path to exported types file.
       */
      types: string;
    };
  }
);
