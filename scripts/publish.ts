import { readFile, writeFile } from 'fs/promises';
import { parseArgs } from 'util';

type Package = {
  name: string;
  version: string;
  publishConfig: {
    registry: string;
  };
};

async function usePackage({
  name,
  version,
  registry,
}: Omit<Package, 'publishConfig'> & { registry: string }) {
  const pkg: Package = JSON.parse(await readFile('package.json', 'utf8'));
  pkg.name = name;
  pkg.version = version;
  pkg.publishConfig = {
    registry: `https://${registry}`,
  };
  await writeFile('package.json', JSON.stringify(pkg, null, 2));
  await writeFile(
    '.npmrc',
    `registry=https://${registry}\n//${registry}:_authToken=${process.env.NODE_AUTH_TOKEN}`
  );
}

async function publish() {
  try {
    console.log(await Bun.$`bun publish`.text());
  } catch (err) {
    console.error(err?.stderr?.toString());
    process.exit(1);
  }
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
  },
});

const { name, version, registry } = values;

if (!name || !version || !registry) {
  throw new Error('name, version, registry are required');
}

await usePackage({ name, version, registry }).then(publish);
