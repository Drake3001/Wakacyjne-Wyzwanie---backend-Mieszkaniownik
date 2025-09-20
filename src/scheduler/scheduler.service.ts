import { Injectable, Logger } from "@nestjs/common";
import { ScrapperService } from "src/scrapper/scrapper.service";
import { OfferService } from "src/offer/offer.service";
import { MatchingService } from "src/notification/matching.service";
import { Cron, CronExpression} from "@nestjs/schedule" 
import { CreateOfferDto } from "src/offer/dto/create-offer.dto";

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private scrapper: ScrapperService,
        private offerService: OfferService,
        private matchingService: MatchingService,
    ) {}
    
    @Cron(CronExpression.EVERY_30_SECONDS)
    async fetch_new_data(): Promise<void> {
        try {
            let offset = 0; 
            const limit = 40;
            const priceTo = "15000";  
            
            this.logger.log(`Starting to fetch offers with limit ${limit}`);
            
            const listings = await this.scrapper.searchApartments({offset, limit, priceTo});
            
            this.logger.log(`Fetched ${listings.length} offers from scrapper`);
            
            let savedCount = 0;
            let updatedCount = 0;
            
            for (const offer of listings) {
                try {

                    const result = await this.offerService.findOneOrCreate(offer);
                    
                    if (result.added_at && result.udpated_at && result.added_at.getTime() === result.udpated_at.getTime()) {
                        savedCount++;
                        this.logger.debug(`Saved new offer: ${offer.link}`);
                    } else {
                        updatedCount++;
                        this.logger.debug(`Updated existing offer: ${offer.link}`);
                    }
                } catch (error) {
                    this.logger.error(`Failed to save/update offer ${offer.link}: ${error.message}`);
                }
            }
            
            if (savedCount > 0) {
                this.logger.log(`Saved ${savedCount} new offers and updated ${updatedCount} existing offers`);

                this.matchingService.processAllOffers();
                this.logger.log(`Triggered matching process for new offers`);
            } else if (updatedCount > 0) {
                this.logger.log(`Updated ${updatedCount} existing offers`);
            } else {
                this.logger.log(`No new offers found in this batch`);
            }
            
        } catch (error) {
            this.logger.error(`Error in fetch_new_data: ${error.message}`, error.stack);
        }
    }
}