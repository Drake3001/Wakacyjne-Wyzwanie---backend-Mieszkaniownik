import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScraperProcessor } from '../scraper.processor';

@Processor('otodom-existing')
export class OtodomExistingProcessor extends WorkerHost {
  private readonly logger = new Logger(OtodomExistingProcessor.name);

  constructor(private readonly scraperProcessor: ScraperProcessor) {
    super();
  }

  async process(job: Job<{ url: string; isNew?: boolean }>): Promise<void> {
    this.logger.log(`Processing Otodom existing offer: ${job.data.url}`);

    return await this.scraperProcessor.process(job);
  }
}
