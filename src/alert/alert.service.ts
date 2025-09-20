import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AlertStatus, Listing_type } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { AlertResponseDto, AlertWithMatchesDto } from './dto/alert-response.dto';

@Injectable()
export class AlertService {
  constructor(private database: DatabaseService) {}

  async create(userId: number, createAlertDto: CreateAlertDto): Promise<AlertResponseDto> {
    if (createAlertDto.minPrice && createAlertDto.minPrice >= createAlertDto.maxPrice) {
      throw new Error('Minimum price must be less than maximum price');
    }

    if (createAlertDto.minFootage && createAlertDto.maxFootage && createAlertDto.minFootage >= createAlertDto.maxFootage) {
      throw new Error('Minimum footage must be less than maximum footage');
    }

    const alert = await this.database.alert.create({
      data: {
        ...createAlertDto,
        userId,
      },
    });

    return this.toAlertResponseDto(alert);
  }

  async findAllByUser(userId: number): Promise<AlertResponseDto[]> {
    const alerts = await this.database.alert.findMany({
      where: { 
        userId,
        status: { not: AlertStatus.DELETED }
      },
      include: {
        _count: {
          select: { matches: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return alerts.map(alert => ({
      ...this.toAlertResponseDto(alert),
      matchesCount: alert._count.matches
    }));
  }

  async findOne(id: number, userId: number): Promise<AlertResponseDto> {
    const alert = await this.database.alert.findFirst({
      where: { 
        id, 
        userId,
        status: { not: AlertStatus.DELETED }
      },
      include: {
        _count: {
          select: { matches: true }
        }
      }
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return {
      ...this.toAlertResponseDto(alert),
      matchesCount: alert._count.matches
    };
  }

  async findOneWithMatches(id: number, userId: number): Promise<AlertWithMatchesDto> {
    const alert = await this.database.alert.findFirst({
      where: { 
        id, 
        userId,
        status: { not: AlertStatus.DELETED }
      },
      include: {
        matches: {
          include: {
            offer: true
          },
          orderBy: { matchedAt: 'desc' }
        }
      }
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return {
      ...this.toAlertResponseDto(alert),
      matches: alert.matches.map(match => ({
        id: match.id,
        alertId: match.alertId,
        offerId: match.offerId,
        matchedAt: match.matchedAt,
        notificationSent: match.notificationSent,
        offer: match.offer
      }))
    };
  }

  async update(id: number, userId: number, updateAlertDto: UpdateAlertDto): Promise<AlertResponseDto> {
    const existingAlert = await this.database.alert.findFirst({
      where: { 
        id, 
        userId,
        status: { not: AlertStatus.DELETED }
      }
    });

    if (!existingAlert) {
      throw new NotFoundException('Alert not found');
    }

    const minPrice = updateAlertDto.minPrice ?? existingAlert.minPrice;
    const maxPrice = updateAlertDto.maxPrice ?? existingAlert.maxPrice;
    if (minPrice && minPrice >= maxPrice) {
      throw new Error('Minimum price must be less than maximum price');
    }

    const minFootage = updateAlertDto.minFootage ?? existingAlert.minFootage;
    const maxFootage = updateAlertDto.maxFootage ?? existingAlert.maxFootage;
    if (minFootage && maxFootage && minFootage >= maxFootage) {
      throw new Error('Minimum footage must be less than maximum footage');
    }

    const updatedAlert = await this.database.alert.update({
      where: { id },
      data: updateAlertDto,
    });

    return this.toAlertResponseDto(updatedAlert);
  }

  async remove(id: number, userId: number): Promise<void> {
    const alert = await this.database.alert.findFirst({
      where: { 
        id, 
        userId,
        status: { not: AlertStatus.DELETED }
      }
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    await this.database.alert.update({
      where: { id },
      data: { status: AlertStatus.DELETED }
    });
  }

  async pauseAlert(id: number, userId: number): Promise<AlertResponseDto> {
    return this.updateStatus(id, userId, AlertStatus.PAUSED);
  }

  async resumeAlert(id: number, userId: number): Promise<AlertResponseDto> {
    return this.updateStatus(id, userId, AlertStatus.ACTIVE);
  }

  private async updateStatus(id: number, userId: number, status: AlertStatus): Promise<AlertResponseDto> {
    const alert = await this.database.alert.findFirst({
      where: { 
        id, 
        userId,
        status: { not: AlertStatus.DELETED }
      }
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const updatedAlert = await this.database.alert.update({
      where: { id },
      data: { status }
    });

    return this.toAlertResponseDto(updatedAlert);
  }

  async findMatchingAlerts(offer: any): Promise<any[]> {
    console.log('Searching for alerts matching offer:', {
      id: offer.id,
      city: offer.city,
      price: offer.price,
      rooms: offer.rooms,
      furniture: offer.furniture,
      footage: offer.footage
    });

    const whereConditions: any = {
      status: AlertStatus.ACTIVE,
      AND: [
        // Price conditions
        {
          OR: [
            { maxPrice: null },
            { maxPrice: { gte: offer.price } }
          ]
        },
        {
          OR: [
            { minPrice: null },
            { minPrice: { lte: offer.price } }
          ]
        },
        // City condition
        {
          OR: [
            { city: null },
            { city: { contains: offer.city, mode: 'insensitive' } }
          ]
        }
      ]
    };


    if (offer.rooms) {
      whereConditions.AND.push({
        OR: [
          { rooms: null },
          { rooms: offer.rooms }
        ]
      });
    }


    if (offer.footage && offer.footage > 0) {
      whereConditions.AND.push({
        OR: [
          { minFootage: null },
          { minFootage: { lte: offer.footage } }
        ]
      });
      whereConditions.AND.push({
        OR: [
          { maxFootage: null },
          { maxFootage: { gte: offer.footage } }
        ]
      });
    }


    if (offer.type) {
      whereConditions.AND.push({
        OR: [
          { type: null },
          { type: offer.type }
        ]
      });
    }


    if (offer.furniture !== null && offer.furniture !== undefined) {
      whereConditions.AND.push({
        OR: [
          { furniture: null },
          { furniture: offer.furniture }
        ]
      });
    }


    if (offer.pets_allowed !== null && offer.pets_allowed !== undefined) {
      whereConditions.AND.push({
        OR: [
          { pets: null },
          { pets: offer.pets_allowed }
        ]
      });
    }


    if (offer.elevator !== null && offer.elevator !== undefined) {
      whereConditions.AND.push({
        OR: [
          { elevator: null },
          { elevator: offer.elevator }
        ]
      });
    }

    console.log('Query conditions:', JSON.stringify(whereConditions, null, 2));

    const results = await this.database.alert.findMany({
      where: whereConditions,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            surname: true
          }
        }
      }
    });

    console.log(`Found ${results.length} matching alerts:`, results.map(r => ({ id: r.id, name: r.name, city: r.city })));

    return results;
  }

  private toAlertResponseDto(alert: any): AlertResponseDto {
    return {
      id: alert.id,
      name: alert.name,
      maxPrice: alert.maxPrice,
      minPrice: alert.minPrice,
      city: alert.city,
      district: alert.district,
      rooms: alert.rooms,
      minFootage: alert.minFootage,
      maxFootage: alert.maxFootage,
      type: alert.type,
      furniture: alert.furniture,
      pets: alert.pets,
      elevator: alert.elevator,
      notificationMethod: alert.notificationMethod,
      discordWebhook: alert.discordWebhook,
      status: alert.status,
      created_at: alert.created_at,
      updated_at: alert.updated_at,
    };
  }
}
