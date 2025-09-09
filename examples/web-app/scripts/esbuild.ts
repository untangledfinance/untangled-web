#!/usr/bin/env bun

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Get the absolute paths
const rootDir = join('.');
const packageJsonPath = join(rootDir, 'package.json');

// Read the original package.json
const originalPackageJson = readFileSync(packageJsonPath, 'utf8');
const packageJson = JSON.parse(originalPackageJson);

// Temporarily remove "type": "module" for bundling
const tempPackageJson = { ...packageJson };
delete tempPackageJson.type;

try {
  console.log(
    '📦 Temporarily updating package.json for CommonJS compatibility...'
  );
  // Write the temporary package.json
  writeFileSync(packageJsonPath, JSON.stringify(tempPackageJson, null, 2));

  // Run esbuild with proper configuration
  const esbuildArgs = [
    'bunx esbuild',
    '--bundle',
    '--platform=node',
    '--target=es2016',
    '--keep-names',
    '--format=cjs',
    '--outdir=./dist/',
    '--out-extension:.js=.cjs',
    '--external:cpu-features',
    '--external:ssh2',
    '--external:bcrypt',
    '--external:mongodb',
    '--external:mongoose',
    '--define:global=globalThis',
    '--banner:js="var AsyncIterator = (async function*(){})().constructor; var AsyncIteratorPrototype = AsyncIterator.prototype;"',
    './src/index.ts',
  ];

  console.log('🚀 Running esbuild with name preservation...');
  execSync(esbuildArgs.join(' '), {
    cwd: rootDir,
    stdio: 'inherit',
  });

  console.log('✅ Build completed successfully with --keep-names!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
} finally {
  console.log('🔄 Restoring original package.json...');
  // Always restore the original package.json
  writeFileSync(packageJsonPath, originalPackageJson);
}
