import { Module } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service";
import { ScrapperModule } from "src/scrapper/scrapper.module";
import { OfferModule } from "src/offer/offer.module";
import { NotificationModule } from "src/notification/notification.module";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
    providers: [SchedulerService],
    imports: [
        ScheduleModule.forRoot(), 
        ScrapperModule,
        OfferModule,
        NotificationModule,
    ],
    exports: [SchedulerService], 
})
export class SchedulerModule {}