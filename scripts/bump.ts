import { parseArgs } from 'util';

type BumpType = 'major' | 'minor' | 'patch' | 'beta';

function now() {
  const pad = (val: number, length = 2) => val.toString().padStart(length, '0');
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const date = pad(d.getUTCDate());
  const hour = pad(d.getUTCHours());
  const minute = pad(d.getUTCMinutes());
  const second = pad(d.getUTCSeconds());
  return [year, month, date, hour, minute, second].join('');
}

async function getLatestVersion(
  options: Partial<{
    name: string;
    registry: string;
    nossl?: boolean;
  }>
) {
  const { name, registry, nossl } = options || {};
  if (!name || !registry) {
    throw new Error('name, registry are required');
  }

  const res = await fetch(`${nossl ? 'http' : 'https'}://${registry}/${name}`);
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

function bump(version: string = '0.0.0', type: BumpType = 'patch') {
  let [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major':
      major++;
      break;
    case 'minor':
      minor++;
      break;
    case 'patch':
      patch++;
      break;
    case 'beta':
      patch++;
      patch = (patch + `-beta.${now()}`) as any;
      break;
  }
  return [major, minor, patch].join('.');
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
    type: {
      type: 'string',
      default: 'patch',
    },
    nossl: {
      type: 'boolean',
      default: false,
    },
    push: {
      type: 'boolean',
      default: false,
    },
  },
});

await getLatestVersion(values)
  .then((version) => bump(version, values.type as BumpType))
  .then((version) => (values.push ? push(version) : Promise.resolve(version)))
  .then(console.log);
