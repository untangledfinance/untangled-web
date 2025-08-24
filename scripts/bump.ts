import { parseArgs } from 'util';

async function getLatestVersion(
  options: Partial<{
    name: string;
    registry: string;
  }>
) {
  const { name, registry } = options || {};
  if (!name || !registry) {
    throw new Error('name, registry are required');
  }

  const res = await fetch(`https://${registry}/${name}`);
  const pkg = (await res.json()) as {
    time: {
      [version: string]: string;
    };
  };

  const versions = Object.keys(pkg.time)
    .map((version) => ({
      version,
      published: new Date(pkg.time[version]).getTime(),
    }))
    .sort((v1, v2) => v1.published - v2.published)
    .map(({ version }) => version)
    .filter((version) => version.match(/^([0-9]+\.){2}[0-9]+$/));
  return versions[versions.length - 1];
}

function minorBump(version: string) {
  if (!version) return '1.0.0';
  const v = version.split('.').map(Number);
  v[2]++;
  return v.join('.');
}

async function push(version: string) {
  await Bun.$`git tag ${version} && git push $(git remote) tag ${version}`;
  return version;
}

const { values } = parseArgs({
  args: Bun.argv,
  allowPositionals: true,
  options: {
    name: {
      type: 'string',
    },
    registry: {
      type: 'string',
    },
    push: {
      type: 'boolean',
      default: false,
    },
  },
});

await getLatestVersion(values)
  .then(minorBump)
  .then((version) => (values.push ? push(version) : Promise.resolve(version)))
  .then(console.log);
