import fs from 'fs';
import path from 'path';
import { config as loadDotenv } from 'dotenv';

interface LoadMainEnvironmentOptions {
  cwd?: string;
  mainModuleDir?: string;
  existsSync?: typeof fs.existsSync;
  dotenvConfig?: typeof loadDotenv;
}

export function resolveMainEnvFilePath(
  options: Pick<LoadMainEnvironmentOptions, 'cwd' | 'mainModuleDir' | 'existsSync'> = {},
): string | null {
  const cwd = options.cwd ?? process.cwd();
  const mainModuleDir = options.mainModuleDir ?? __dirname;
  const existsSync = options.existsSync ?? fs.existsSync;
  const candidates = [path.resolve(cwd, '.env'), path.resolve(mainModuleDir, '../.env')];

  for (const candidate of candidates.filter(
    (value, index, array) => array.indexOf(value) === index,
  )) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function loadMainEnvironment(options: LoadMainEnvironmentOptions = {}): string | null {
  const envFilePath = resolveMainEnvFilePath(options);
  if (!envFilePath) {
    return null;
  }

  const dotenvConfig = options.dotenvConfig ?? loadDotenv;
  dotenvConfig({ path: envFilePath });
  return envFilePath;
}
