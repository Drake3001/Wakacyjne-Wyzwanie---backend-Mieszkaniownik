import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { DatabaseModule } from '../database/database.module';
import { AlertModule } from '../alert/alert.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  providers: [NotificationService, MatchingService],
  controllers: [MatchingController],
  imports: [DatabaseModule, AlertModule, AuthModule],
  exports: [NotificationService, MatchingService],
})
export class NotificationModule {}
