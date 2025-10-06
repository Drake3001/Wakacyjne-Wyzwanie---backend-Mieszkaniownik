import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import * as puppeteer from 'puppeteer';
import { BuildingType } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { MatchService } from '../match/match.service';
import { ScraperService } from './scraper.service';
import { StreetNameCleaner } from './services/street-name-cleaner';
import { GeocodingService } from '../heatmap/geocoding.service';
import { aiAddressExtractorService } from './services/ai-address-extractor.service';
import { BrowserSetupService } from './services/browser-setup.service';
import { ParameterParserService } from './services/parameter-parser.service';

type ScrapedDetails = Record<string, string>;

interface ScrapedData {
  price: string | null;
  title: string | null;
  description: string | null;
  details: ScrapedDetails;
  createdAt: string | null;
  images?: string[];
  negotiable?: boolean;
  contact?:
    | {
        name: string | null;
        memberSince: string | null;
        lastSeen: string | null;
      }
    | string;
}

type OtodomScrapedData = ScrapedData & {
  source: 'otodom';
  footage: string | null;
  address: string | null;
  contact: string | null;
};

@Processor('scraper')
export class ScraperProcessor extends WorkerHost {
  private readonly logger = new Logger(ScraperProcessor.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly matchService: MatchService,
    private readonly scraperService: ScraperService,
    private readonly geocodingService: GeocodingService,
    private readonly googleAiService: aiAddressExtractorService,
    private readonly browserSetup: BrowserSetupService,
    private readonly paramParser: ParameterParserService,
  ) {
    super();
  }

  private async generateSummary(
    title: string,
    description: string | null,
  ): Promise<string | null> {
    if (!description || description.trim() === '') {
      this.logger.debug('No description available for summary generation');
      return null;
    }

    try {
      return await this.googleAiService.generateSummary(title, description);
    } catch (error) {
      this.logger.warn(
        `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  private async geocodeAddress(
    address: string,
    city?: string,
  ): Promise<{ latitude: number | null; longitude: number | null }> {
    try {
      const fullAddress =
        city && !address.includes(city) ? `${address}, ${city}` : address;

      this.logger.debug(`Geocoding address: ${fullAddress}`);

      const result = await this.geocodingService.geocodeAddress(fullAddress);

      if (result) {
        this.logger.log(
          `Successfully geocoded "${fullAddress}" -> lat: ${result.lat}, lng: ${result.lng}`,
        );
        return {
          latitude: result.lat,
          longitude: result.lng,
        };
      } else {
        this.logger.warn(`Failed to geocode address: ${fullAddress}`);
        return { latitude: null, longitude: null };
      }
    } catch (error) {
      this.logger.warn(
        `Geocoding error for "${address}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { latitude: null, longitude: null };
    }
  }

  async process(job: Job<{ url: string; isNew?: boolean }>) {
    if (job.name !== 'processOffer') {
      return;
    }

    const isNew = job.data.isNew || false;
    const priority = isNew ? 'NEW' : 'EXISTING';

    this.logger.log(
      `PROCESSOR: Starting ${priority} job ${job.id} for URL: ${job.data.url}`,
    );

    if (job.data.url.includes('otodom.pl')) {
      this.logger.log(`PROCESSOR: Detected OTODOM URL - ${job.data.url}`);
    } else {
      this.logger.log(`PROCESSOR: Detected OLX URL - ${job.data.url}`);
    }

    try {
      const browser = await this.browserSetup.createBrowser();
      const page = await this.browserSetup.setupPage(browser);

      await page.goto(job.data.url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);

              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const currentUrl = page.url();
      if (currentUrl.includes('otodom.pl')) {
        await this.processOtodomOffer(page, currentUrl, isNew);
      } else {
        await this.processOlxOffer(page, currentUrl, isNew);
      }

      await browser.close();
    } catch (error) {
      this.logger.error(
        `Error processing offer ${job.data.url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async processOlxOffer(
    page: puppeteer.Page,
    url: string,
    isNew = false,
  ) {
    try {
      const data = await page.evaluate(() => {
        type ScrapedResult = {
          title: string | null;
          price: number | null;
          description: string | null;
          city: string;
          district: string;
          images: string[];
          views: number;
          createdAt: string | null;
          negotiable: boolean;
          rawParameters: Record<string, string>;
          contact: {
            name: string | null;
            memberSince: string | null;
            lastSeen: string | null;
          };
        };

        const titleElement = document.querySelector(
          '[data-testid="offer_title"] h4',
        );
        const title = titleElement?.textContent?.trim() || null;

        const priceElement = document.querySelector(
          '[data-testid="ad-price-container"] h3',
        );
        const priceText = priceElement?.textContent?.trim() || '';
        const price = priceText ? parseInt(priceText.replace(/\D/g, '')) : null;

        const negotiableElement = document.querySelector(
          '[data-testid="ad-price-container"] .css-nw4rgq',
        );
        const negotiable = Boolean(
          negotiableElement?.textContent?.trim().toLowerCase() ===
            'do negocjacji',
        );

        const createdAtElement = document.querySelector(
          '[data-testid="ad-posted-at"]',
        );
        const dateText = createdAtElement?.textContent?.trim() || '';
        let createdAt: string | null = null;

        if (dateText) {
          const monthMap = {
            stycznia: 0,
            lutego: 1,
            marca: 2,
            kwietnia: 3,
            maja: 4,
            czerwca: 5,
            lipca: 6,
            sierpnia: 7,
            września: 8,
            października: 9,
            listopada: 10,
            grudnia: 11,
          };

          const match = dateText.match(/(\d+)\s+(\w+)\s+(\d+)/);
          if (match) {
            const day = parseInt(match[1]);
            const month = monthMap[match[2] as keyof typeof monthMap];
            const year = parseInt(match[3]);
            if (!isNaN(day) && month !== undefined && !isNaN(year)) {
              createdAt = new Date(year, month, day).toISOString();
            }
          }
        }

        const descElement = document.querySelector(
          '[data-cy="ad_description"] .css-19duwlz',
        );
        const description = descElement?.textContent?.trim() || null;

        const parameters: Record<string, string> = {};
        const paramElements = document.querySelectorAll(
          '[data-testid="ad-parameters-container"] p.css-13x8d99',
        );

        paramElements.forEach((elem, index) => {
          const text = elem.textContent?.trim() || '';
          console.log(`Parameter element ${index}:`, {
            text,
            innerHTML: elem.innerHTML,
            hasSpanChild: !!elem.querySelector('span:not([class])'),
            textLength: text.length,
            charCodes: Array.from(text)
              .map((c) => c.charCodeAt(0))
              .join(','),
          });

          if (elem.querySelector('span:not([class])')) {
            const value = elem.querySelector('span')?.textContent?.trim();
            if (value) {
              parameters[value] = 'Tak';
              console.log(`Added span parameter: "${value}" = "Tak"`);
            }
            return;
          }

          const parts = text.split(':');
          console.log(`Split by colon - parts:`, parts);
          if (parts.length === 2) {
            const key = parts[0].trim();
            const value = parts[1].trim();
            if (key && value) {
              parameters[key] = value;
              console.log(`Added colon parameter: "${key}" = "${value}"`);
            }
          } else if (text.includes(' ')) {
            const [key, value] = text.split(' ');
            if (key && value) {
              parameters[key] = value;
              console.log(`Added space parameter: "${key}" = "${value}"`);
            }
          } else if (text) {
            parameters[text] = 'Tak';
            console.log(`Added flag parameter: "${text}" = "Tak"`);
          }
        });

        const locationElement = document.querySelector('.css-9pna1a');
        const locationText = locationElement?.textContent?.trim() || '';

        let city = '';
        let district = '';

        if (locationText) {
          const parts = locationText.split(',');
          if (parts.length >= 2) {
            city = parts[0].trim();
            district = parts[1].trim();
          } else {
            city = parts[0].trim();
          }
        }

        const images = Array.from(
          document.querySelectorAll('[data-testid="ad-photo"] img'),
        )
          .map((img) => img.getAttribute('src'))
          .filter((src): src is string => src !== null);

        const sellerName =
          document
            .querySelector('[data-testid="user-profile-user-name"]')
            ?.textContent?.trim() || null;
        const memberSince =
          document
            .querySelector('[data-testid="member-since"] span')
            ?.textContent?.trim() || null;
        const lastSeen =
          document
            .querySelector('[data-testid="lastSeenBox"] .css-1p85e15')
            ?.textContent?.trim() || null;

        let views = 0;
        let viewsExtractionMethod = 'none';

        console.log('=== VIEWS EXTRACTION UPDATED 2025 ===');
        console.log('Page URL:', window.location.href);
        console.log('Page has been scrolled to trigger lazy loading');

        const inactiveAdElement = document.querySelector(
          '[data-testid="ad-inactive-msg"]',
        );
        if (inactiveAdElement) {
          console.log('Method 1 - Ad inactive, views not available');
          views = 0;
          viewsExtractionMethod = 'inactive-ad';
        } else {
          console.log(
            'Method 1 - Ad is active, proceeding with views extraction',
          );
        }

        if (views === 0) {
          const selector = '[data-testid="page-view-counter"]';
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent?.trim() || '';
            console.log(
              `Modern selector 3 - Found element with selector ${selector}:`,
              text,
            );

            if (text.toLowerCase().includes('wyświetl')) {
              const viewsMatch = text.match(/(\d+)/);
              if (viewsMatch) {
                views = parseInt(viewsMatch[1]);
                viewsExtractionMethod = 'modern-selector-3';
                console.log(
                  'Modern selector 3 - SUCCESS extracted views:',
                  views,
                );
              }
            }
          }
        }

        console.log(
          `Final views extraction result: views=${views}, method=${viewsExtractionMethod}, url=${window.location.href}`,
        );

        console.log('City extraction debug:', {
          locationText,
          extractedCity: city,
          extractedDistrict: district,
          url: window.location.href,
        });

        return {
          title,
          price,
          description,
          city,
          district,
          images,
          views,
          createdAt,
          negotiable,
          rawParameters: parameters,
          contact: {
            name: sellerName,
            memberSince,
            lastSeen,
          },
          viewsExtractionMethod,
        } as ScrapedResult & {
          viewsExtractionMethod: string;
          debugInfo: string[];
        };
      });

      if (!data) {
        throw new Error('Failed to extract data from OLX page');
      }

      const extractionData = data as typeof data & {
        viewsExtractionMethod: string;
        debugInfo?: string[];
      };
      this.logger.log(
        `Views extraction for ${url}: ${data.views} views using method: ${extractionData.viewsExtractionMethod}`,
      );

      if (
        extractionData.debugInfo &&
        (data.views === 0 || process.env.DEBUG_VIEWS_EXTRACTION)
      ) {
        this.logger.debug(`Views extraction debug for ${url}:`);
        extractionData.debugInfo.forEach((debugLine, index) => {
          this.logger.debug(`   ${index + 1}. ${debugLine}`);
        });
      }

      const parsed = this.paramParser.parseOlxParameters(data.rawParameters);

      const findParamValue = (targetKey: string) =>
        this.paramParser.findParamValue(data.rawParameters, targetKey);

      console.log('Final boolean values before database update:', {
        elevator: parsed.elevator,
        pets: parsed.pets,
        furniture: parsed.furniture,
        title: data.title || 'unknown',
      });

      if (!data) {
        throw new Error('Failed to extract data from OLX page');
      }

      let extractedStreet: string | null = null;
      let extractedStreetNumber: string | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        if (data.title) {
          this.logger.debug(`Extracting address from: ${data.title}`);
          const addressResult = await this.scraperService.extractAddress(
            data.title,
            data.description || undefined,
          );

          if (addressResult.street) {
            const cleanedStreet = StreetNameCleaner.normalizeStreetName(
              addressResult.street,
            );

            if (StreetNameCleaner.isValidStreetName(cleanedStreet)) {
              extractedStreet = cleanedStreet;
              extractedStreetNumber = addressResult.streetNumber || null;
              this.logger.log(
                `Address extracted: ${extractedStreet}${extractedStreetNumber ? ` ${extractedStreetNumber}` : ''} (confidence: ${addressResult.confidence})`,
              );

              const fullAddress = `${extractedStreet}${extractedStreetNumber ? ` ${extractedStreetNumber}` : ''}, ${data.city}`;
              const coordinates = await this.geocodeAddress(
                fullAddress,
                data.city,
              );
              latitude = coordinates.latitude;
              longitude = coordinates.longitude;
            } else {
              this.logger.warn(
                `Rejected invalid street after final cleaning: ${addressResult.street} -> ${cleanedStreet}`,
              );
            }
          } else {
            this.logger.debug(
              'No address found in offer text - trying city-level geocoding',
            );
            if (data.city) {
              const cityAddress = data.district
                ? `${data.district}, ${data.city}`
                : data.city;
              const coordinates = await this.geocodeAddress(cityAddress);
              latitude = coordinates.latitude;
              longitude = coordinates.longitude;
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Address extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      const existingOffer = await this.databaseService.offer.findUnique({
        where: { link: url },
      });

      let createdOffer: { id: number } | null = null;

      if (existingOffer) {
        const previousViews = existingOffer.views;
        const newViews = data.views || existingOffer.views;

        console.log('Final boolean values before database update:', {
          elevator: parsed.elevator,
          pets: parsed.pets,
          furniture: parsed.furniture,
          title: data.title || existingOffer.title,
        });

        createdOffer = await this.databaseService.offer.update({
          where: { link: url },
          data: {
            title: data.title || existingOffer.title,
            price: data.price || existingOffer.price,
            footage: parsed.footage || existingOffer.footage,
            city:
              data.city && data.city.trim() !== ''
                ? data.city.trim()
                : existingOffer.city || 'Nieznane',
            district: data.district || existingOffer.district,
            street: extractedStreet || existingOffer.street,
            streetNumber: extractedStreetNumber || existingOffer.streetNumber,
            latitude: latitude ?? existingOffer.latitude,
            longitude: longitude ?? existingOffer.longitude,
            description: data.description || existingOffer.description,
            summary:
              (await this.generateSummary(
                data.title || existingOffer.title,
                data.description || existingOffer.description,
              )) || existingOffer.summary,
            rooms: parsed.rooms ? parseInt(parsed.rooms) : existingOffer.rooms,
            floor: parsed.floor ? parseInt(parsed.floor) : existingOffer.floor,
            furniture: parsed.furniture ?? existingOffer.furniture,
            elevator: parsed.elevator ?? existingOffer.elevator,
            pets: parsed.pets ?? existingOffer.pets,
            negotiable: data.negotiable ?? existingOffer.negotiable,
            ownerType: parsed.ownerType ?? existingOffer.ownerType,
            parkingType: parsed.parkingType ?? existingOffer.parkingType,
            rentAdditional:
              parsed.rentAdditional ?? existingOffer.rentAdditional,
            views: newViews,
            images:
              data.images && data.images.length > 0
                ? data.images
                : existingOffer.images,
            contact: data.contact?.name
              ? `${data.contact.name}${data.contact.memberSince ? ` - Na OLX od ${data.contact.memberSince}` : ''}${data.contact.lastSeen ? ` - ${data.contact.lastSeen}` : ''}`
              : findParamValue('kontakt') || existingOffer.contact,
            infoAdditional:
              findParamValue('informacje dodatkowe') ??
              existingOffer.infoAdditional,
            furnishing:
              findParamValue('wyposażenie') ?? existingOffer.furnishing,
            media: findParamValue('media') ?? existingOffer.media,
            updatedAt: new Date(),
          },
        });

        this.logger.log(
          `Updated offer ${existingOffer.id} views: ${previousViews} → ${newViews} (${newViews > previousViews ? `+${newViews - previousViews}` : 'no change'})`,
        );
        this.logger.debug(
          `Updated existing offer ${existingOffer.id} for URL: ${url}`,
        );
      } else {
        const validCity =
          data.city && data.city.trim() !== '' ? data.city.trim() : 'Nieznane';
        if (validCity === 'Nieznane') {
          this.logger.warn(
            `Creating OLX offer with fallback city "${validCity}" (original: "${data.city}") for URL: ${url}`,
          );
        }

        createdOffer = await this.databaseService.offer.create({
          data: {
            link: url,
            title: data.title || '',
            buildingType: parsed.buildingType,
            price: data.price || 0,
            footage: parsed.footage || 0,
            city: validCity,
            district: data.district || null,
            street: extractedStreet,
            streetNumber: extractedStreetNumber,
            latitude: latitude,
            longitude: longitude,
            description: data.description || '',
            summary: await this.generateSummary(
              data.title || '',
              data.description || '',
            ),
            rooms: parsed.rooms ? parseInt(parsed.rooms) : null,
            floor: parsed.floor ? parseInt(parsed.floor) : null,
            furniture: parsed.furniture,
            elevator: parsed.elevator,
            pets: parsed.pets,
            ownerType: parsed.ownerType,
            parkingType: parsed.parkingType,
            rentAdditional: parsed.rentAdditional,
            source: 'olx',
            negotiable: data.negotiable || false,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            views: data.views,
            images: data.images || [],
            contact: data.contact?.name
              ? `${data.contact.name}${data.contact.memberSince ? ` - Na OLX od ${data.contact.memberSince}` : ''}${data.contact.lastSeen ? ` - ${data.contact.lastSeen}` : ''}`
              : findParamValue('kontakt') || null,
            infoAdditional: findParamValue('informacje dodatkowe') || null,
            furnishing: findParamValue('wyposażenie') || null,
            media: findParamValue('media') || null,
            isNew: isNew,
          },
        });

        this.logger.log(
          `✨ Created new offer ${createdOffer.id} with ${data.views} views (method: ${extractionData.viewsExtractionMethod})`,
        );
        this.logger.debug(
          `Created new offer ${createdOffer.id} for URL: ${url}`,
        );
      }

      if (createdOffer?.id) {
        try {
          const matchCount = await this.matchService.processNewOffer(
            createdOffer.id,
          );
          this.logger.log(
            `Processed ${matchCount} matches for offer ${createdOffer.id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process matches for offer ${createdOffer.id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `OLX scraping completed for ${url} - Offer ID: ${createdOffer?.id}, Views: ${data.views}, Method: ${extractionData.viewsExtractionMethod}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing OLX offer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async processOtodomOffer(
    page: puppeteer.Page,
    url: string,
    isNew = false,
  ) {
    try {
      const data = await page.evaluate(() => {
        const priceElement =
          document.querySelector('[data-cy="adPageHeaderPrice"]') ||
          document.querySelector('strong[aria-label="Cena"]') ||
          document.querySelector('.css-1o51x5a.elm6lnc1') ||
          document.querySelector('.elm6lnc1');
        const price = priceElement?.textContent?.trim() ?? null;

        const titleElement =
          document.querySelector('[data-cy="adPageAdTitle"]') ||
          document.querySelector('h1.css-4utb9r.e1dqm4hr1') ||
          document.querySelector('h1');
        const title = titleElement?.textContent?.trim() ?? null;

        const addressElement =
          document.querySelector('a[href="#map"].css-1eowip8.e1aypsbg1') ||
          document.querySelector('.e1aypsbg1') ||
          document.querySelector('a[href="#map"]');
        const address = addressElement?.textContent?.trim() ?? null;

        const descElement =
          document.querySelector('[data-cy="adPageAdDescription"]') ||
          document.querySelector('.css-1nuh7jg.e1op7yyl1') ||
          document.querySelector('.e1op7yyl1');
        const description = descElement?.textContent?.trim() ?? null;

        const footageElement = Array.from(
          document.querySelectorAll('.css-1okys8k.e1mm5aqc2, .e1mm5aqc2'),
        ).find((el) => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('m²') && /\d+\s*m²/.test(text);
        });
        const footage = footageElement?.textContent?.trim() ?? null;

        const images = Array.from(document.querySelectorAll('img'))
          .map((img) => img.getAttribute('src'))
          .filter(
            (src) => src && (src.includes('otodom') || src.includes('cdn')),
          )
          .slice(0, 10);

        const details: Record<string, string> = {};

        const detailSections = document.querySelectorAll(
          '.css-1xw0jqp.e1mm5aqc1, .e1mm5aqc1',
        );
        detailSections.forEach((section) => {
          const keyElement = section.querySelector(
            '.css-1okys8k.e1mm5aqc2:first-child, .e1mm5aqc2:first-child',
          );
          const valueElement = section.querySelector(
            '.css-1okys8k.e1mm5aqc2:last-child, .e1mm5aqc2:last-child',
          );

          if (keyElement && valueElement) {
            const key = keyElement.textContent
              ?.trim()
              .toLowerCase()
              .replace(':', '');

            const spans = valueElement.querySelectorAll(
              'span.css-axw7ok.e1mm5aqc4, span.e1mm5aqc4, span',
            );
            let value = valueElement.textContent?.trim();

            if (spans.length > 0) {
              const spanTexts = Array.from(spans)
                .map((span) => span.textContent?.trim())
                .filter((text) => text && text.length > 0)
                .join(', ');
              if (spanTexts) {
                value = spanTexts;
              }
            }

            if (key && value && key !== value) {
              details[key] = value;

              if (key.includes('powierzchnia') || key.includes('m²')) {
                details['powierzchnia'] = value;
              }
              if (key.includes('pokoi') || key.includes('rooms')) {
                details['liczba pokoi'] = value;
                details['pokoi'] = value;
              }
              if (key.includes('piętro') || key.includes('floor')) {
                details['piętro'] = value;
              }

              if (key.includes('winda') || key.includes('elevator')) {
                details['winda'] = value;
              }
              if (
                key.includes('rodzaj zabudowy') ||
                key.includes('building type')
              ) {
                details['typ budynku'] = value;
              }
              if (
                key.includes('umeblowani') ||
                key.includes('furnished') ||
                key.includes('umeblowanie')
              ) {
                details['umeblowane'] = value;
              }
              if (key.includes('czynsz') && !key.includes('kaucja')) {
                details['czynsz dodatkowy'] = value;
              }
              if (
                key.includes('dostępne od') ||
                key.includes('available from')
              ) {
                details['kontakt'] = `Dostępne od: ${value}`;
              }
              if (
                key.includes('typ ogłoszeniodawcy') ||
                key.includes('advertiser type')
              ) {
                details['typ ogłoszeniodawcy'] = value;
              }
              if (
                key.includes('informacje dodatkowe') ||
                key.includes('additional information')
              ) {
                details['informacje dodatkowe'] = value;
              }
              if (
                key.includes('wyposażenie') &&
                !key.includes('bezpieczeństwo') &&
                !key.includes('zabezpieczenia')
              ) {
                details['wyposażenie'] = value;
              }
              if (key.includes('media') && !key.includes('social')) {
                details['media'] = value;
              }
            }
          }
        });

        const allTextElements = document.querySelectorAll(
          '.css-1okys8k.e1mm5aqc2, .e1mm5aqc2',
        );
        for (let i = 0; i < allTextElements.length - 1; i += 2) {
          const keyEl = allTextElements[i];
          const valueEl = allTextElements[i + 1];
          if (keyEl && valueEl) {
            const keyText =
              keyEl.textContent?.trim().toLowerCase().replace(':', '') || '';
            const valueText = valueEl.textContent?.trim() || '';

            if (
              keyText &&
              valueText &&
              keyText !== valueText &&
              !details[keyText]
            ) {
              details[keyText] = valueText;

              if (keyText.includes('powierzchnia') || keyText.includes('m²')) {
                details['powierzchnia'] = valueText;
              }
              if (keyText.includes('pokoi')) {
                details['liczba pokoi'] = valueText;
                details['pokoi'] = valueText;
              }
              if (keyText.includes('piętro')) {
                details['piętro'] = valueText;
              }

              if (keyText.includes('winda')) {
                details['winda'] = valueText;
              }
              if (keyText.includes('rodzaj zabudowy')) {
                details['typ budynku'] = valueText;
              }
              if (
                keyText.includes('umeblowani') ||
                keyText.includes('umeblowanie')
              ) {
                details['umeblowane'] = valueText;
              }
              if (keyText.includes('czynsz') && !keyText.includes('kaucja')) {
                details['czynsz dodatkowy'] = valueText;
              }
              if (keyText.includes('dostępne od')) {
                details['kontakt'] = `Dostępne od: ${valueText}`;
              }
              if (keyText.includes('typ ogłoszeniodawcy')) {
                details['typ ogłoszeniodawcy'] = valueText;
              }
              if (keyText.includes('informacje dodatkowe')) {
                details['informacje dodatkowe'] = valueText;
              }
              if (
                keyText.includes('wyposażenie') &&
                !keyText.includes('bezpieczeństwo') &&
                !keyText.includes('zabezpieczenia')
              ) {
                details['wyposażenie'] = valueText;
              }
              if (keyText.includes('media') && !keyText.includes('social')) {
                details['media'] = valueText;
              }
            }
          }
        }

        if (details['wyposażenie']) {
          const equipmentValue = details['wyposażenie'].toLowerCase();
          if (equipmentValue.includes('meble')) {
            details['umeblowane'] = 'tak';
          }
        }

        Object.entries(details).forEach(([, value]) => {
          if (value && value.toLowerCase().includes('meble')) {
            details['umeblowane'] = 'tak';
          }
        });

        let contact: string | null = null;

        const sellerNameElement = document.querySelector(
          '.e4jldvc1.css-vbzhap',
        );
        let sellerName = sellerNameElement?.textContent?.trim() || null;

        if (sellerName) {
          const dashIndex = sellerName.indexOf(' - ');
          if (dashIndex !== -1) {
            const afterDash = sellerName.substring(dashIndex + 3).toLowerCase();
            const promotionalKeywords = [
              'włącz',
              'powiadomienia',
              'okazji',
              'przegap',
              'nie przegap',
              'subskryb',
              'subscribe',
              'follow',
              'obserwuj',
            ];

            if (
              promotionalKeywords.some((keyword) => afterDash.includes(keyword))
            ) {
              sellerName = sellerName.substring(0, dashIndex);
            }
          }

          sellerName = sellerName.replace(/[\s-]+$/, '').trim();
        }

        const offerTypeElement = document.querySelector('.css-f4ltfo');
        const offerType = offerTypeElement?.textContent?.trim() || null;

        if (sellerName || offerType) {
          const contactParts: string[] = [];
          if (sellerName) contactParts.push(sellerName);
          if (offerType) contactParts.push(offerType);
          contact = contactParts.join(' - ');
        }

        return {
          price,
          title,
          footage,
          address,
          description,
          details,
          images,
          contact,
          source: 'otodom' as const,
        } as OtodomScrapedData;
      });

      const priceValue = data.price
        ? parseFloat(data.price.replace(/[^0-9,]/g, '').replace(',', '.'))
        : 0;
      const address = data.address?.split(',') || [];

      let extractedStreet: string | null = null;
      let extractedStreetNumber: string | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        const addressText = data.address || '';
        if (data.title || addressText) {
          this.logger.debug(
            `Extracting Otodom address from: ${data.title}, Address: ${addressText}`,
          );
          const addressResult = await this.scraperService.extractAddress(
            data.title || '',
            addressText || data.description || undefined,
          );

          if (addressResult.street) {
            const cleanedStreet = StreetNameCleaner.normalizeStreetName(
              addressResult.street,
            );

            if (StreetNameCleaner.isValidStreetName(cleanedStreet)) {
              extractedStreet = cleanedStreet;
              extractedStreetNumber = addressResult.streetNumber || null;
              this.logger.log(
                `Otodom address extracted: ${extractedStreet}${extractedStreetNumber ? ` ${extractedStreetNumber}` : ''} (confidence: ${addressResult.confidence})`,
              );

              const city = address[address.length - 2]?.trim() || 'Nieznane';
              const fullAddress = `${extractedStreet}${extractedStreetNumber ? ` ${extractedStreetNumber}` : ''}, ${city}`;
              const coordinates = await this.geocodeAddress(fullAddress, city);
              latitude = coordinates.latitude;
              longitude = coordinates.longitude;
            } else {
              this.logger.warn(
                `Rejected invalid Otodom street after final cleaning: ${addressResult.street} -> ${cleanedStreet}`,
              );
            }
          } else {
            this.logger.debug(
              'No address found in Otodom offer text - trying location geocoding',
            );

            const city = address[address.length - 2]?.trim() || 'Nieznane';
            const district = address[address.length - 3]?.trim();
            const geocodingAddress =
              addressText || (district ? `${district}, ${city}` : city);
            if (geocodingAddress && geocodingAddress !== 'Nieznane') {
              const coordinates = await this.geocodeAddress(geocodingAddress);
              latitude = coordinates.latitude;
              longitude = coordinates.longitude;
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Otodom address extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      const findParamValue = (targetKey: string) =>
        this.paramParser.findParamValue(data.details, targetKey);

      const furniture = this.paramParser.parseBoolean(
        findParamValue('umeblowane'),
        'Furniture (Otodom)',
      );

      const elevator = this.paramParser.parseBoolean(
        findParamValue('winda'),
        'Elevator (Otodom)',
      );

      const ownerType = this.paramParser.parseOwnerType(data.details);

      const existingOffer = await this.databaseService.offer.findUnique({
        where: { link: url },
      });

      let createdOffer: { id: number } | null = null;

      if (existingOffer) {
        const previousViews = existingOffer.views;
        const newViews = 0;

        createdOffer = await this.databaseService.offer.update({
          where: { link: url },
          data: {
            title: data.title || existingOffer.title,
            price: priceValue || existingOffer.price,
            footage:
              this.paramParser.parseOtodomFootage(data.footage, data.details) ||
              existingOffer.footage,
            city:
              address[address.length - 2]?.trim() ||
              existingOffer.city ||
              'Nieznane',
            district:
              address[address.length - 3]?.trim() || existingOffer.district,
            street: extractedStreet || existingOffer.street,
            streetNumber: extractedStreetNumber || existingOffer.streetNumber,
            latitude: latitude ?? existingOffer.latitude,
            longitude: longitude ?? existingOffer.longitude,
            description: data.description || existingOffer.description,
            rooms:
              parseInt(data.details['liczba pokoi'] || data.details['pokoi']) ||
              existingOffer.rooms,
            floor: parseInt(data.details['piętro']) || existingOffer.floor,
            furniture: furniture ?? existingOffer.furniture,
            elevator: elevator ?? existingOffer.elevator,
            ownerType: ownerType ?? existingOffer.ownerType,
            contact:
              typeof data.contact === 'string'
                ? data.contact
                : existingOffer.contact,
            infoAdditional:
              data.details['informacje dodatkowe'] ??
              existingOffer.infoAdditional,
            furnishing: data.details['wyposażenie'] ?? existingOffer.furnishing,
            media: data.details['media'] ?? existingOffer.media,
            updatedAt: new Date(),
            views: newViews,
          },
        });

        this.logger.log(
          `Updated Otodom offer ${existingOffer.id} views: ${previousViews} → ${newViews} (Otodom doesn't provide view counts)`,
        );
        this.logger.debug(
          `Updated existing Otodom offer ${existingOffer.id} for URL: ${url}`,
        );
      } else {
        createdOffer = await this.databaseService.offer.create({
          data: {
            link: url,
            title: data.title || '',
            buildingType: BuildingType.APARTMENT,
            price: priceValue,
            footage:
              this.paramParser.parseOtodomFootage(data.footage, data.details) ||
              0,
            city: address[address.length - 2]?.trim() || 'Nieznane',
            district: address[address.length - 3]?.trim() || null,
            street: extractedStreet,
            streetNumber: extractedStreetNumber,
            latitude: latitude,
            longitude: longitude,
            description: data.description || '',
            summary: await this.generateSummary(
              data.title || '',
              data.description || '',
            ),
            rooms:
              parseInt(data.details['liczba pokoi'] || data.details['pokoi']) ||
              null,
            floor: parseInt(data.details['piętro']) || null,
            furniture: furniture,
            elevator: elevator,
            ownerType: ownerType,
            contact: typeof data.contact === 'string' ? data.contact : null,
            infoAdditional: data.details['informacje dodatkowe'] || null,
            furnishing: data.details['wyposażenie'] || null,
            media: data.details['media'] || null,
            source: 'otodom',
            createdAt: new Date(),
            views: 0,
            images: data.images || [],
            isNew: isNew,
          },
        });

        this.logger.log(
          `Created new Otodom offer ${createdOffer.id} with 0 views (Otodom doesn't provide view counts)`,
        );
        this.logger.debug(
          `Created new Otodom offer ${createdOffer.id} for URL: ${url}`,
        );
      }

      if (createdOffer?.id) {
        try {
          const matchCount = await this.matchService.processNewOffer(
            createdOffer.id,
          );
          this.logger.log(
            `Processed ${matchCount} matches for Otodom offer ${createdOffer.id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process matches for Otodom offer ${createdOffer.id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `Otodom scraping completed for ${url} - Offer ID: ${createdOffer?.id}, Views: 0 (not available)`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing Otodom offer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
