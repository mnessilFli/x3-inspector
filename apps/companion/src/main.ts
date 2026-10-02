import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfigFile } from './config/loadConfig';
import { loadOrCreateToken } from './config/token';
import { EnvironmentRegistry } from './env/registry';
import { buildRouter, COMPANION_VERSION } from './http/routes';
import { createServer } from './http/server';
import { createLogger } from './logger';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

function main(): void {
  const dotenv = path.join(appDir, '.env');
  if (fs.existsSync(dotenv)) process.loadEnvFile(dotenv);

  const configPath = process.env.X3I_CONFIG ? path.resolve(process.env.X3I_CONFIG) : path.join(appDir, 'config', 'companion.config.json');
  const config = loadConfigFile(configPath);
  const logger = createLogger({ level: config.logging.level, ...(config.logging.file ? { file: config.logging.file } : {}), scope: 'companion' });
  const token = loadOrCreateToken(path.join(appDir, 'config', '.companion-token'));

  const registry = new EnvironmentRegistry(config, logger);
  const router = buildRouter(registry, config, token.value);
  const server = createServer({ config, router, token: token.value, logger });

  server.listen(config.server.port, config.server.host, () => {
    const scheme = config.server.tls ? 'https' : 'http';
    logger.info(`X3 Inspector Companion ${COMPANION_VERSION} listening on ${scheme}://${config.server.host}:${config.server.port} (read-only)`);
    logger.info(`environments: ${config.environments.map((e) => `${e.id} [${e.kind}, ${e.metadataProvider}${e.database ? `, ${e.database.type} ${e.database.schema}` : ''}]`).join(', ')}`);
    if (token.created || args.has('--show-token')) {
      console.log(`\nPairing token (paste it in X3 Inspector > TOOLS > Settings):\n  ${token.value}\n`);
    } else {
      console.log(`Pairing token stored in ${token.file} (run with --show-token to print it).`);
    }
  });

  const shutdown = async () => {
    logger.info('shutting down');
    server.close();
    await registry.closeAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

try {
  main();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
}
