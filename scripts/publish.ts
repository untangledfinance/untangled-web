import { readFile, writeFile, rm as removeFile, exists } from 'fs/promises';
import { parseArgs } from 'util';

import modules from '../modules.json';

/**
 * `package.json` structure.
 */
type Package = {
  name: string;
  version: string;
  publishConfig: {
    registry: string;
  };
  exports: {
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
  };
};

async function usePackage(dryrun?: boolean) {
  const pkg: Package = JSON.parse(await readFile('package.json', 'utf8'));
  const oldPkg = structuredClone(pkg);

  const apply = async (
    options: Partial<{ name: string; version: string; registry: string }>
  ) => {
    const { name, version, registry } = options || {};
    if (!name || !version || !registry) {
      throw new Error('name, version, registry are required');
    }
    pkg.name = name;
    pkg.version = version;
    pkg.publishConfig = {
      registry: `https://${registry}`,
    };
    pkg.exports = modules.reduce((e, module) => {
      e[`./${module}`] = {
        import: `./dist/${module}/index.js`,
        types: `./dist/${module}/index.d.ts`,
      };
      return e;
    }, {});
    await writeFile('package.json', JSON.stringify(pkg, null, 2));
    dryrun && console.log(`[dryrun] Updated package.json:\n`, pkg);
    const authToken = process.env.NODE_AUTH_TOKEN;
    await writeFile(
      '.npmrc',
      `registry=https://${registry}\n//${registry}:_authToken=${authToken}`
    );
    dryrun &&
      console.log(
        `[dryrun] Created .npmrc:\n`,
        `registry=https://${registry}\n//${registry}:_authToken=${authToken?.substring(0, 3)}***`
      );
  };

  const restore = async (err?: Error) => {
    await writeFile('package.json', JSON.stringify(oldPkg, null, 2));
    dryrun && console.log(`[dryrun] Restored package.json.`);
    await removeFile('.npmrc');
    dryrun && console.log(`[dryrun] Removed .npmrc.`);
    if (err) throw err;
  };

  const publish = async () => {
    if (!(await exists('.npmrc'))) {
      return new Error('.npmrc not found');
    }
    try {
      const result = dryrun
        ? '[dryrun] Published.'
        : await Bun.$`bun publish`.text();
      console.log(result);
    } catch (err) {
      return new Error(err?.stderr?.toString());
    }
  };

  return { apply, restore, publish };
}

const { values } = parseArgs({
  args: Bun.argv,
  allowPositionals: true,
  options: {
    name: {
      type: 'string',
    },
    version: {
      type: 'string',
    },
    registry: {
      type: 'string',
    },
    dryrun: {
      type: 'boolean',
      default: false,
    },
  },
});

const { apply, publish, restore } = await usePackage(values.dryrun);

await apply(values).then(publish).then(restore);
