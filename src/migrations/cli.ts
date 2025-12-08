#!/usr/bin/env node

import mongoose from 'mongoose';
import { config } from '../config/env';
import { Migrator } from './migrator';
import { logger } from '../utils/logger';

const command = process.argv[2];

async function main(): Promise<void> {
  try {
    // Подключаемся к БД
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to database');

    const migrator = new Migrator();

    switch (command) {
      case 'status':
        {
          const status = await migrator.status();
          // eslint-disable-next-line no-console
          console.log('\n📊 Migration Status:');
          // eslint-disable-next-line no-console
          console.log(`\n✅ Applied (${status.applied.length}):`);
          status.applied.forEach(name => {
            // eslint-disable-next-line no-console
            console.log(`   - ${name}`);
          });
          // eslint-disable-next-line no-console
          console.log(`\n⏳ Pending (${status.pending.length}):`);
          if (status.pending.length === 0) {
            // eslint-disable-next-line no-console
            console.log('   No pending migrations');
          } else {
            status.pending.forEach(name => {
              // eslint-disable-next-line no-console
              console.log(`   - ${name}`);
            });
          }
          // eslint-disable-next-line no-console
          console.log('');
        }
        break;

      case 'rollback':
        {
          const migrationName = process.argv[3];
          if (!migrationName) {
            // eslint-disable-next-line no-console
            console.error(
              '❌ Please specify migration name: yarn migrate:rollback <migration-name>'
            );
            process.exit(1);
          }
          await migrator.rollbackMigration(migrationName);
          // eslint-disable-next-line no-console
          console.log(`✅ Migration ${migrationName} rolled back successfully`);
        }
        break;

      case 'run':
      default:
        {
          await migrator.run();
          // eslint-disable-next-line no-console
          console.log('✅ All migrations completed');
        }
        break;
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('Migration CLI error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

void main();
