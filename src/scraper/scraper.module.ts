import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ScraperService } from './scraper.service';
import { ScraperProcessor } from './scraper.processor';
import { ScraperController } from './scraper.controller';
import { ScraperThreadManagerService } from './services/scraper-thread-manager.service';
import { aiAddressExtractorService } from './services/ai-address-extractor.service';
import { BrowserSetupService } from './services/browser-setup.service';
import { ParameterParserService } from './services/parameter-parser.service';
import { OlxExistingProcessor } from './processors/olx-existing.processor';
import { OtodomExistingProcessor } from './processors/otodom-existing.processor';
import { OlxNewProcessor } from './processors/olx-new.processor';
import { OtodomNewProcessor } from './processors/otodom-new.processor';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MatchModule } from '../match/match.module';
import { HeatmapModule } from '../heatmap/heatmap.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'scraper',
    }),
    BullModule.registerQueue({
      name: 'olx-existing',
    }),
    BullModule.registerQueue({
      name: 'otodom-existing',
    }),
    BullModule.registerQueue({
      name: 'olx-new',
    }),
    BullModule.registerQueue({
      name: 'otodom-new',
    }),
    DatabaseModule,
    AuthModule,
    MatchModule,
    HeatmapModule,
  ],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    ScraperProcessor,
    ScraperThreadManagerService,
    aiAddressExtractorService,
    BrowserSetupService,
    ParameterParserService,
    OlxExistingProcessor,
    OtodomExistingProcessor,
    OlxNewProcessor,
    OtodomNewProcessor,
  ],
  exports: [
    ScraperService,
    ScraperThreadManagerService,
    aiAddressExtractorService,
  ],
})
export class ScraperModule {}
