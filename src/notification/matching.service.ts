import { Injectable, Logger } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { AlertService } from '../alert/alert.service';
import { NotificationService, NotificationData } from '../notification/notification.service';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private database: DatabaseService,
    private alertService: AlertService,
    private notificationService: NotificationService,
  ) {}

  async processOffer(offer: any): Promise<void> {
    this.logger.log(`Processing offer ${offer.id}: ${offer.city} - ${offer.price} PLN`);
    
    try {
      const matchingAlerts = await this.alertService.findMatchingAlerts(offer);
      this.logger.log(`Found ${matchingAlerts.length} matching alerts for offer ${offer.id}`);
      
      for (const alert of matchingAlerts) {
        await this.createMatch(alert, offer);
      }
    } catch (error) {
      this.logger.error(`Error processing offer ${offer.id}: ${error.message}`, error.stack);
    }
  }

  private async createMatch(alert: any, offer: any): Promise<void> {
    try {
      const existingMatch = await this.database.alertMatch.findUnique({
        where: {
          alertId_offerId: {
            alertId: alert.id,
            offerId: offer.id,
          },
        },
      });

      if (existingMatch) {
        this.logger.log(`Match already exists for alert ${alert.id} and offer ${offer.id}`);
        return;
      }

      const match = await this.database.alertMatch.create({
        data: {
          alertId: alert.id,
          offerId: offer.id,
          matchedAt: new Date(),
          notificationSent: false,
        },
      });

      this.logger.log(`Created match ${match.id} for alert ${alert.id} and offer ${offer.id}`);

      await this.sendMatchNotification(alert, offer, match.id);

      await this.database.alertMatch.update({
        where: { id: match.id },
        data: { notificationSent: true },
      });

    } catch (error) {
      this.logger.error(`Error creating match for alert ${alert.id} and offer ${offer.id}: ${error.message}`, error.stack);
    }
  }

  private async sendMatchNotification(alert: any, offer: any, matchId: number): Promise<void> {
    try {
      const notificationData: NotificationData = {
        userId: alert.userId,
        alertId: alert.id,
        alertName: alert.name,
        offer,
        userEmail: alert.user.email,
        userName: alert.user.name || undefined,
        method: alert.notificationMethod,
        discordWebhook: alert.discordWebhook || undefined,
      };

      await this.notificationService.sendNotification(notificationData);
      
      this.logger.log(`Notification sent for match ${matchId}`);
    } catch (error) {
      this.logger.error(`Failed to send notification for match ${matchId}: ${error.message}`, error.stack);
    }
  }

  async getMatchesForAlert(alertId: number, userId: number): Promise<any[]> {
    const alert = await this.database.alert.findFirst({
      where: { 
        id: alertId, 
        userId,
        status: { not: AlertStatus.DELETED }
      }
    });

    if (!alert) {
      throw new Error('Alert not found');
    }

    return this.database.alertMatch.findMany({
      where: { alertId },
      include: {
        offer: true,
      },
      orderBy: { matchedAt: 'desc' },
    });
  }

  async getMatchesForUser(userId: number): Promise<any[]> {
    return this.database.alertMatch.findMany({
      where: {
        alert: { userId }
      },
      include: {
        alert: {
          select: {
            id: true,
            name: true,
          }
        },
        offer: true,
      },
      orderBy: { matchedAt: 'desc' },
    });
  }

  async processAllOffers(): Promise<void> {
    this.logger.log('Processing all offers for matching...');

    const offers = await this.database.offer.findMany({
      where: {
        valid_to: {
          gt: new Date(),
        },
      },
    });

    this.logger.log(`Found ${offers.length} active offers to process`);

    for (const offer of offers) {
      await this.processOffer(offer);
    }

    this.logger.log('Finished processing all offers');
  }

  async reprocessAlert(alertId: number): Promise<void> {
    this.logger.log(`Reprocessing matches for alert ${alertId}...`);

    const alert = await this.database.alert.findUnique({
      where: { id: alertId },
      include: { user: true },
    });

    if (!alert || alert.status !== AlertStatus.ACTIVE) {
      this.logger.log(`Alert ${alertId} not found or not active`);
      return;
    }

    const offers = await this.database.offer.findMany({
      where: {
        valid_to: {
          gt: new Date(),
        },
      },
    });

    let processedCount = 0;
    for (const offer of offers) {
      const matchingAlerts = await this.alertService.findMatchingAlerts(offer);
      const isMatch = matchingAlerts.some(a => a.id === alertId);
      
      if (isMatch) {
        await this.createMatch(alert, offer);
        processedCount++;
      }
    }

    this.logger.log(`Reprocessed ${processedCount} matches for alert ${alertId}`);
  }
}
