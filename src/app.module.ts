import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { DatabaseModule } from './database/database.module';
import { ScraperModule } from './scraper/scraper.module';
import { UserModule } from './user/user.module';
import { AlertModule } from './alert/alert.module';
import { MatchModule } from './match/match.module';
import { NotificationModule } from './notification/notification.module';
import { HeatmapModule } from './heatmap/heatmap.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    CoreModule,
    DatabaseModule,
    UserModule,
    AuthModule,
    ScraperModule,
    AlertModule,
    MatchModule,
    NotificationModule,
    HeatmapModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
