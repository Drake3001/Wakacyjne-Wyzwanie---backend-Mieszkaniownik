import { Injectable, Logger } from '@nestjs/common';
import { NotificationMethod } from '@prisma/client';
import { DatabaseService } from '../database/database.service';

export interface NotificationData {
  userId: number;
  alertId: number;
  alertName: string;
  offer: any;
  userEmail: string;
  userName?: string;
  method: NotificationMethod;
  discordWebhook?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private database: DatabaseService) {}

  async sendNotification(data: NotificationData): Promise<void> {
    try {
      const notification = await this.database.notification.create({
        data: {
          userId: data.userId,
          alertId: data.alertId,
          type: 'ALERT_MATCH',
          title: `New match for "${data.alertName}"`,
          message: this.formatMessage(data),
          method: data.method,
          sent: false,
        },
      });

      
      if (data.method === NotificationMethod.EMAIL || data.method === NotificationMethod.BOTH) {
        // await this.sendEmailNotification(data);
      }

      if (data.method === NotificationMethod.DISCORD || data.method === NotificationMethod.BOTH) {
        // await this.sendDiscordNotification(data);
      }

      await this.database.notification.update({
        where: { id: notification.id },
        data: {
          sent: true,
          sentAt: new Date(),
        },
      });

    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`, error.stack);
      
      await this.database.notification.updateMany({
        where: {
          userId: data.userId,
          alertId: data.alertId,
          sent: false,
        },
        data: {
          error: error.message,
        },
      });
    }
  }

  private formatMessage(data: NotificationData): string {
    return `A new property has been found that matches your alert "${data.alertName}":
    
📍 Location: ${data.offer.city}, ${data.offer.address}
💰 Price: ${data.offer.price} PLN
🏠 Type: ${data.offer.type || 'Not specified'}
📐 Footage: ${data.offer.footage ? data.offer.footage + ' m²' : 'Not specified'}
🚪 Rooms: ${data.offer.rooms || 'Not specified'}
🪑 Furniture: ${data.offer.furniture ? 'Yes' : 'No'}
🐾 Pets allowed: ${data.offer.pets_allowed ? 'Yes' : 'No'}
🛗 Elevator: ${data.offer.elevator ? 'Yes' : 'No'}

🔗 View offer: ${data.offer.link}`;
  }
}
