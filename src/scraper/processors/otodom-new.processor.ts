import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScraperProcessor } from '../scraper.processor';

@Processor('otodom-new')
export class OtodomNewProcessor extends WorkerHost {
  private readonly logger = new Logger(OtodomNewProcessor.name);

  constructor(private readonly scraperProcessor: ScraperProcessor) {
    super();
  }

  async process(job: Job<{ url: string; isNew?: boolean }>): Promise<void> {
    this.logger.log(`Processing NEW Otodom offer: ${job.data.url}`);

    return await this.scraperProcessor.process(job);
  }
}
