import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { EnvModule } from './config/env.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [EnvModule, PrismaModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
