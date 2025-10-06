import { Module } from '@nestjs/common';
import { HeatmapController } from './heatmap.controller';
import { HeatmapService } from './heatmap.service';
import { GeocodingService } from './geocoding.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HeatmapController],
  providers: [HeatmapService, GeocodingService],
  exports: [HeatmapService, GeocodingService],
})
export class HeatmapModule {}
