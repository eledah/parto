#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateMapData, ValidationError } from '../dist/index.js';

const args = process.argv.slice(2).filter((a) => a !== '--');

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: parto-validate-map <file.json> [more.json ...]

Validate Parto argument map JSON files.

Exit code 0 = all valid (warnings may be printed)
Exit code 1 = validation errors`);
  process.exit(args.length === 0 ? 1 : 0);
}

let failed = false;

for (const file of args) {
  const path = resolve(file);
  let parsed;

  try {
    const raw = readFileSync(path, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    failed = true;
    console.error(`✗ ${file}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  try {
    const { warnings } = validateMapData(parsed);
    console.log(`✓ ${file}`);
    for (const w of warnings) {
      console.warn(`  warning: ${w}`);
    }
  } catch (err) {
    failed = true;
    console.error(`✗ ${file}`);
    if (err instanceof ValidationError) {
      for (const issue of err.issues) {
        console.error(`  ${issue}`);
      }
    } else {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

process.exit(failed ? 1 : 0);
