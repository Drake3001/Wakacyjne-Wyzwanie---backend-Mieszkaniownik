import {
  Controller,
  Get,
  Query,
  Logger,
  Req,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { HeatmapService } from './heatmap.service';
import { HeatmapQueryDto } from './dto/heatmap-query.dto';
import { AuthGuard } from '../auth/auth.guard';
import type { UserRequest } from '../auth/dto/user-request';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@ApiTags('heatmap')
@ApiBearerAuth()
@Controller('heatmap')
@UseGuards(AuthGuard)
export class HeatmapController {
  private readonly logger = new Logger(HeatmapController.name);

  constructor(private readonly heatmapService: HeatmapService) {}

  @Get('data')
  @Public()
  @ApiOperation({
    summary: 'Get heatmap data with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Retrieved heatmap data successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async getHeatmapData(
    @Query() query: HeatmapQueryDto,
    @Req() req?: UserRequest,
  ) {
    try {
      const userId = req?.user?.id;
      this.logger.log(`Heatmap data requested with filters:`, query);
      if (userId) {
        this.logger.log(
          `User ${userId} is authenticated - showing user matches`,
        );
      }

      const heatmapData = await this.heatmapService.generateHeatmapData(
        query,
        userId,
      );

      this.logger.log(`Returning ${heatmapData.points.length} heatmap points`);

      return {
        success: true,
        data: heatmapData,
        message: userId
          ? `Generated heatmap with ${heatmapData.points.length} user matches`
          : `Generated heatmap with ${heatmapData.points.length} points`,
      };
    } catch (error) {
      this.logger.error('Error generating heatmap data:', error);
      return {
        success: false,
        data: {
          points: [],
          maxViews: 0,
          minViews: 0,
          totalOffers: 0,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('stats')
  @Public()
  @ApiOperation({
    summary: 'Get heatmap statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Retrieved heatmap statistics successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async getHeatmapStats(@Req() req?: UserRequest) {
    try {
      const userId = req?.user?.id;
      const stats = await this.heatmapService.getHeatmapStats(userId);
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('Error getting heatmap stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
