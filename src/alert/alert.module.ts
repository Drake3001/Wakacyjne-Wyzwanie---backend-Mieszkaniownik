import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [AlertController],
  providers: [AlertService],
  imports: [DatabaseModule, AuthModule],
  exports: [AlertService],
})
export class AlertModule {}
