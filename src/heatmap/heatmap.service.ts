import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  HeatmapData,
  HeatmapPoint,
  HeatmapQuery,
} from './dto/heatmap.interface';
import type { BuildingType } from '@prisma/client';

@Injectable()
export class HeatmapService {
  private readonly logger = new Logger(HeatmapService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async generateHeatmapData(
    query: HeatmapQuery = {},
    userId?: number,
  ): Promise<HeatmapData> {
    this.logger.log('Generating heatmap data with query:', query);
    this.logger.log(`Applied limit: ${Number(query.limit) || 5000}`);

    if (userId) {
      this.logger.log(`Generating heatmap for user ${userId} matches`);
      return this.generateUserMatchesHeatmap(query, userId);
    }

    const whereClause = this.buildWhereClause(query);

    const offers = await this.databaseService.offer.findMany({
      where: {
        ...whereClause,
        available: true,
        views: { gt: 0 },
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Number(query.limit) || 5000,
    });

    this.logger.log(
      `Found ${offers.length} offers with coordinates for heatmap`,
    );

    if (offers.length === 0) {
      return {
        points: [],
        maxViews: 0,
        minViews: 0,
        totalOffers: 0,
      };
    }

    const viewsCounts = offers.map((offer) => offer.views);
    const maxViews = Math.max(...viewsCounts);
    const minViews = Math.min(...viewsCounts);

    const points: HeatmapPoint[] = [];
    const bounds = {
      north: -90,
      south: 90,
      east: -180,
      west: 180,
    };

    for (const offer of offers) {
      if (offer.latitude !== null && offer.longitude !== null) {
        const intensity =
          maxViews > minViews
            ? (offer.views - minViews) / (maxViews - minViews)
            : 1;

        const point: HeatmapPoint = {
          lat: Number(offer.latitude),
          lng: Number(offer.longitude),
          intensity: Math.max(0.1, intensity),
          weight: offer.views,
          offerId: offer.id,
          title: offer.title,
          price: offer.price ? Number(offer.price) : undefined,
          address:
            offer.street && offer.streetNumber
              ? `${offer.street} ${offer.streetNumber}`
              : offer.district || offer.city,
        };

        points.push(point);

        bounds.north = Math.max(bounds.north, point.lat);
        bounds.south = Math.min(bounds.south, point.lat);
        bounds.east = Math.max(bounds.east, point.lng);
        bounds.west = Math.min(bounds.west, point.lng);
      }
    }

    this.logger.log(
      `Generated ${points.length} heatmap points from stored coordinates (no geocoding needed!)`,
    );

    return {
      points,
      maxViews,
      minViews,
      totalOffers: offers.length,
      bounds: points.length > 0 ? bounds : undefined,
    };
  }

  async getHeatmapStats(userId?: number) {
    if (userId) {
      return this.getUserMatchesStats(userId);
    }

    const totalOffers = await this.databaseService.offer.count({
      where: { available: true },
    });

    const offersWithViews = await this.databaseService.offer.count({
      where: { available: true, views: { gt: 0 } },
    });

    const offersWithAddresses = await this.databaseService.offer.count({
      where: {
        available: true,
        OR: [{ street: { not: '' } }, { district: { not: '' } }],
      },
    });

    const offersWithCoordinates = await this.databaseService.offer.count({
      where: {
        available: true,
        latitude: { not: null },
        longitude: { not: null },
      },
    });

    const viewsStats = await this.databaseService.offer.aggregate({
      where: { available: true, views: { gt: 0 } },
      _avg: { views: true },
      _max: { views: true },
      _min: { views: true },
    });

    return {
      totalOffers,
      offersWithViews,
      offersWithAddresses,
      offersWithCoordinates,
      viewsStats: {
        average: viewsStats._avg.views || 0,
        maximum: viewsStats._max.views || 0,
        minimum: viewsStats._min.views || 0,
      },
    };
  }

  private buildWhereClause(query: HeatmapQuery): Record<string, any> {
    const where: Record<string, any> = {};

    if (query.city) {
      where.city = {
        contains: query.city,
        mode: 'insensitive',
      };
    }

    if (query.district) {
      where.district = {
        contains: query.district,
        mode: 'insensitive',
      };
    }

    if (query.minPrice || query.maxPrice) {
      const priceFilter: Record<string, any> = {};
      if (query.minPrice) priceFilter.gte = query.minPrice;
      if (query.maxPrice) priceFilter.lte = query.maxPrice;
      where.price = priceFilter;
    }

    if (query.minViews || query.maxViews) {
      const viewsFilter: Record<string, any> = {};
      if (query.minViews) viewsFilter.gte = query.minViews;
      if (query.maxViews) viewsFilter.lte = query.maxViews;
      where.views = viewsFilter;
    }

    if (query.buildingType) {
      where.buildingType = query.buildingType as BuildingType;
    }

    return where;
  }

  private async generateUserMatchesHeatmap(
    query: HeatmapQuery,
    userId: number,
  ): Promise<HeatmapData> {
    this.logger.log(`Generating heatmap for user ${userId} matches`);

    const matches = await this.databaseService.match.findMany({
      where: {
        alert: {
          userId,
        },
      },
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            price: true,
            views: true,
            latitude: true,
            longitude: true,
            street: true,
            streetNumber: true,
            district: true,
            city: true,
            createdAt: true,
            available: true,
          },
        },
      },
      orderBy: {
        matchedAt: 'desc',
      },
      take: Number(query.limit) || 5000,
    });

    this.logger.log(`Found ${matches.length} matches for user ${userId}`);

    const validOffers = matches
      .map((match) => match.offer)
      .filter(
        (offer) =>
          offer.available &&
          offer.latitude !== null &&
          offer.longitude !== null,
      );

    if (validOffers.length === 0) {
      return {
        points: [],
        maxViews: 0,
        minViews: 0,
        totalOffers: 0,
      };
    }

    const viewsCounts = validOffers.map((offer) => offer.views);
    const maxViews = Math.max(...viewsCounts);
    const minViews = Math.min(...viewsCounts);

    const points: HeatmapPoint[] = [];
    const bounds = {
      north: -90,
      south: 90,
      east: -180,
      west: 180,
    };

    for (const offer of validOffers) {
      if (offer.latitude !== null && offer.longitude !== null) {
        const intensity =
          maxViews > minViews
            ? (offer.views - minViews) / (maxViews - minViews)
            : 1;

        const point: HeatmapPoint = {
          lat: Number(offer.latitude),
          lng: Number(offer.longitude),
          intensity: Math.max(0.1, intensity),
          weight: offer.views,
          offerId: offer.id,
          title: offer.title,
          price: offer.price ? Number(offer.price) : undefined,
          address:
            offer.street && offer.streetNumber
              ? `${offer.street} ${offer.streetNumber}`
              : offer.district || offer.city,
        };

        points.push(point);

        bounds.north = Math.max(bounds.north, point.lat);
        bounds.south = Math.min(bounds.south, point.lat);
        bounds.east = Math.max(bounds.east, point.lng);
        bounds.west = Math.min(bounds.west, point.lng);
      }
    }

    this.logger.log(
      `Generated ${points.length} heatmap points from user matches`,
    );

    return {
      points,
      maxViews,
      minViews,
      totalOffers: validOffers.length,
      bounds: points.length > 0 ? bounds : undefined,
    };
  }

  private async getUserMatchesStats(userId: number) {
    this.logger.log(`Getting heatmap stats for user ${userId} matches`);

    const totalMatches = await this.databaseService.match.count({
      where: {
        alert: {
          userId,
        },
      },
    });

    const matchesWithViews = await this.databaseService.match.count({
      where: {
        alert: {
          userId,
        },
        offer: {
          available: true,
          views: { gt: 0 },
        },
      },
    });

    const matchesWithAddresses = await this.databaseService.match.count({
      where: {
        alert: {
          userId,
        },
        offer: {
          available: true,
          OR: [{ street: { not: '' } }, { district: { not: '' } }],
        },
      },
    });

    const matchesWithCoordinates = await this.databaseService.match.count({
      where: {
        alert: {
          userId,
        },
        offer: {
          available: true,
          latitude: { not: null },
          longitude: { not: null },
        },
      },
    });

    const matchesWithOfferViews = await this.databaseService.match.findMany({
      where: {
        alert: {
          userId,
        },
        offer: {
          available: true,
          views: { gt: 0 },
        },
      },
      select: {
        offer: {
          select: {
            views: true,
          },
        },
      },
    });

    const viewsCounts = matchesWithOfferViews.map((match) => match.offer.views);
    const viewsStats =
      viewsCounts.length > 0
        ? {
            average:
              viewsCounts.reduce((sum, views) => sum + views, 0) /
              viewsCounts.length,
            maximum: Math.max(...viewsCounts),
            minimum: Math.min(...viewsCounts),
          }
        : {
            average: 0,
            maximum: 0,
            minimum: 0,
          };

    return {
      totalOffers: totalMatches,
      offersWithViews: matchesWithViews,
      offersWithAddresses: matchesWithAddresses,
      offersWithCoordinates: matchesWithCoordinates,
      viewsStats,
      userContext: {
        userId,
        isUserSpecific: true,
        description: 'Statistics based on user matches',
      },
    };
  }
}
