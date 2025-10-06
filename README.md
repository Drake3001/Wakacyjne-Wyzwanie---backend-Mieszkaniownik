# Mieszkaniownik Architecture

## System Overview

```mermaid
graph TB
    subgraph "NestJS Application"
        subgraph "Core Modules"
            AM[AuthModule<br/>JWT + Google OAuth]
            UM[UserModule<br/>User Management]
            DM[DatabaseModule<br/>Prisma ORM]
            NM[NotificationModule<br/>Email + Discord]
            MM[MatchModule<br/>Alert Matching]
            HM[HeatmapModule<br/>Data Visualization]
        end

        subgraph "Scraper Module - Multi-Threading Architecture"
            SS[ScraperService<br/>Main Orchestrator]
            STM[ScraperThreadManager<br/>Worker Management]
            SP[ScraperProcessor<br/>Job Processing]

            subgraph "Dedicated Processors"
                OEP[OlxExistingProcessor]
                OTEP[OtodomExistingProcessor]
                ONP[OlxNewProcessor]
                OTNP[OtodomNewProcessor]
            end

            subgraph "Worker Threads"
                EOW[OLX Worker<br/>JavaScript Worker Thread]
                EOTW[Otodom Worker<br/>JavaScript Worker Thread]
            end

            subgraph "Queue System"
                SQ[scraper queue<br/>Main processing]
                OEQ[olx-existing queue<br/>Existing offers]
                OTEQ[otodom-existing queue<br/>Existing offers]
                ONQ[olx-new queue<br/>New offers - Priority 1]
                OTNQ[otodom-new queue<br/>New offers - Priority 1]
            end
        end
    end

    subgraph "External Services"
        REDIS[(Redis<br/>Queue Storage)]
        POSTGRES[(PostgreSQL<br/>Database)]
        GOOGLE[Google AI<br/>Address Extraction]
        NOMINATIM[Nominatim OSM<br/>Geocoding Service]
        GMAPS[Google Static Maps<br/>Map Images]
        EMAIL[Gmail SMTP<br/>Notifications]
        DISCORD[Discord API<br/>Notifications]
    end

    subgraph "Target Websites"
        OLX[OLX.pl<br/>Property Listings]
        OTODOM[Otodom.pl<br/>Property Listings]
    end

    %% Core connections
    SS --> STM
    STM --> EOW
    STM --> EOTW
    SS --> SP

    %% Queue connections
    STM --> OEQ
    STM --> OTEQ
    STM --> ONQ
    STM --> OTNQ

    OEP --> SQ
    OTEP --> SQ
    ONP --> SQ
    OTNP --> SQ

    %% External connections
    DM --> POSTGRES
    SQ --> REDIS
    OEQ --> REDIS
    OTEQ --> REDIS
    ONQ --> REDIS
    OTNQ --> REDIS

    EOW --> OLX
    EOTW --> OTODOM

    SP --> GOOGLE
    SP --> NOMINATIM
    NM --> EMAIL
    NM --> DISCORD
    NM --> GMAPS
```

## Multi-Threading Architecture Details

```mermaid
sequenceDiagram
    participant App as NestJS App
    participant SS as ScraperService
    participant STM as ScraperThreadManager
    participant EOW as OLX Worker
    participant EOTW as Otodom Worker
    participant Q as Queue System
    participant P as Processors

    Note over App: Application Startup
    App->>SS: onModuleInit()
    SS->>STM: startExistingOffersWorkers()

    par OLX Existing Worker
        STM->>EOW: Start Worker Thread (isNewOffersOnly: false)
        EOW->>OLX: Scrape main listing pages
        EOW->>STM: Return offer URLs
        STM->>Q: Queue to olx-existing
    and Otodom Existing Worker
        STM->>EOTW: Start Worker Thread (isNewOffersOnly: false)
        EOTW->>OTODOM: Scrape main listing pages
        EOTW->>STM: Return offer URLs
        STM->>Q: Queue to otodom-existing
    end

    Note over App: Every Minute (Cron Job)
    SS->>STM: startNewOffersWorkers()

    par OLX New Offers
        STM->>EOW: Start Worker Thread (isNewOffersOnly: true)
        EOW->>OLX: Scrape first page only
        EOW->>STM: Return new offer URLs
        STM->>Q: Queue to olx-new (Priority 1)
    and Otodom New Offers
        STM->>EOTW: Start Worker Thread (isNewOffersOnly: true)
        EOTW->>OTODOM: Scrape first page only
        EOTW->>STM: Return new offer URLs
        STM->>Q: Queue to otodom-new (Priority 1)
    end

    Note over P: Background Processing
    Q->>P: Process queued offers
    P->>POSTGRES: Save offer data (isNew field)
```

## Technology Stack & Frameworks

```mermaid
graph LR
    subgraph "Backend Framework"
        NEST[NestJS v10+<br/>TypeScript Framework<br/>Dependency Injection]
    end

    subgraph "Database Layer"
        PRISMA[Prisma ORM<br/>Type-safe DB access<br/>Schema management]
        PG[PostgreSQL<br/>Relational Database<br/>ACID compliance]
    end

    subgraph "Queue Management"
        BULLMQ[BullMQ<br/>Redis-based queues<br/>Job processing]
        REDIS_DB[(Redis<br/>In-memory storage<br/>Queue persistence)]
    end

    subgraph "Scraping Technology"
        PUPPETEER[Puppeteer<br/>Headless Chrome<br/>Web scraping]
        STEALTH[Puppeteer-extra-plugin-stealth<br/>Anti-detection]
        WORKER[Node.js Worker Threads<br/>True parallelism]
    end

    subgraph "AI & Processing"
        GOOGLE_AI[Google AI Gemini<br/>Address extraction<br/>NLP processing]
        GEOCODING[Nominatim Geocoding<br/>Address to coordinates<br/>Circuit breaker pattern]
        SCHEDULER[Node-cron<br/>Scheduled tasks]
    end

    subgraph "Maps & Visualization"
        STATIC_MAPS[Google Static Maps<br/>Embedded map images<br/>Location visualization]
        HEATMAP[Leaflet Heatmaps<br/>Property density<br/>Interactive maps]
    end

    subgraph "Authentication"
        JWT[JWT Tokens<br/>Stateless auth]
        OAUTH[Google OAuth2<br/>Social login]
        PASSPORT[Passport.js<br/>Auth strategies]
    end

    subgraph "Notifications"
        NODEMAILER[Nodemailer<br/>Email sending]
        DISCORD_JS[Discord.js<br/>Bot integration]
    end

    NEST --> PRISMA
    PRISMA --> PG
    NEST --> BULLMQ
    BULLMQ --> REDIS_DB
    NEST --> PUPPETEER
    PUPPETEER --> STEALTH
    NEST --> WORKER
    NEST --> GOOGLE_AI
    NEST --> GEOCODING
    NEST --> SCHEDULER
    NEST --> JWT
    NEST --> OAUTH
    NEST --> PASSPORT
    NEST --> NODEMAILER
    NEST --> DISCORD_JS
    NEST --> STATIC_MAPS
    NEST --> HEATMAP
```

## Database Schema & Data Flow

```mermaid
erDiagram
    User {
        int id PK
        string email UK
        string name
        string provider
        datetime createdAt
        datetime updatedAt
        boolean isArchived
    }

    Alert {
        int id PK
        int userId FK
        string name
        string city
        int minPrice
        int maxPrice
        int minRooms
        int maxRooms
        int minFootage
        int maxFootage
        boolean elevator
        boolean furnished
        boolean pets
        boolean parking
        string[] keywords
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Offer {
        int id PK
        string title
        string description
        string link UK
        int price
        string city
        string street
        string streetNumber
        string district
        string estateName
        decimal latitude
        decimal longitude
        int rooms
        int footage
        string buildingType
        boolean elevator
        boolean furnished
        boolean pets
        boolean parking
        string[] images
        string source
        int views
        string viewsMethod
        boolean isNew
        boolean available
        datetime createdAt
        datetime updatedAt
    }

    Match {
        int id PK
        int alertId FK
        int offerId FK
        float score
        boolean notified
        datetime createdAt
    }

    Notification {
        int id PK
        int userId FK
        int matchId FK
        string type
        string channel
        string status
        string content
        datetime sentAt
        datetime createdAt
    }

    User ||--o{ Alert : creates
    Alert ||--o{ Match : generates
    Offer ||--o{ Match : triggers
    Match ||--o{ Notification : sends
    User ||--o{ Notification : receives
```

## Scraping Algorithm Flow

```mermaid
flowchart TD
    START([Application Start]) --> INIT_WORKERS[Initialize 2 Existing Workers<br/>OLX + Otodom]

    INIT_WORKERS --> EOW_START{EOLX Worker<br/>Existing Offers}
    INIT_WORKERS --> EOTW_START{Otodom Worker<br/>Existing Offers}

    EOW_START --> EOW_SCRAPE[Scrape OLX listing pages<br/>Extract offer URLs]
    EOTW_START --> EOTW_SCRAPE[Scrape Otodom listing pages<br/>Extract offer URLs]

    EOW_SCRAPE --> EOW_QUEUE[Queue to olx-existing<br/>Priority: 5]
    EOTW_SCRAPE --> EOTW_QUEUE[Queue to otodom-existing<br/>Priority: 5]

    EOW_QUEUE --> PROCESS_EXISTING[Process Existing Offers<br/>isNew: false]
    EOTW_QUEUE --> PROCESS_EXISTING

    %% Cron job every minute
    CRON_MINUTE([Every Minute<br/>Cron Job]) --> NEW_WORKERS[Start 2 New Offer Workers<br/>OLX + Otodom]

    NEW_WORKERS --> EOW_NEW{OLX Worker<br/>New Offers Only}
    NEW_WORKERS --> EOTW_NEW{Otodom Worker<br/>New Offers Only}

    EOW_NEW --> EOW_NEW_SCRAPE[Scrape OLX first page<br/>Check for new offers]
    EOTW_NEW --> EOTW_NEW_SCRAPE[Scrape Otodom first page<br/>Check for new offers]

    EOW_NEW_SCRAPE --> EOW_NEW_QUEUE[Queue to olx-new<br/>Priority: 1 - HIGH]
    EOTW_NEW_SCRAPE --> EOTW_NEW_QUEUE[Queue to otodom-new<br/>Priority: 1 - HIGH]

    EOW_NEW_QUEUE --> PROCESS_NEW[Process New Offers<br/>isNew: true]
    EOTW_NEW_QUEUE --> PROCESS_NEW

    %% Processing flow
    PROCESS_EXISTING --> SCRAPE_DETAILS[Scrape Individual Offer<br/>Extract full details]
    PROCESS_NEW --> SCRAPE_DETAILS

    SCRAPE_DETAILS --> AI_EXTRACT[Google AI Address Extraction<br/>Clean & validate data]
    AI_EXTRACT --> GEOCODE[Geocode Address<br/>Get GPS coordinates<br/>Store in database]
    GEOCODE --> SAVE_DB[Save to PostgreSQL<br/>with coordinates & isNew flag]
    SAVE_DB --> MATCH_CHECK[Check Alert Matches<br/>Score calculation]
    MATCH_CHECK --> NOTIFY{Matches Found?}

    NOTIFY -->|Yes| SEND_NOTIFICATIONS[Send Notifications<br/>Email + Discord]
    NOTIFY -->|No| END_PROCESS[End Processing]
    SEND_NOTIFICATIONS --> END_PROCESS

    END_PROCESS --> CRON_MINUTE
```

## Worker Thread Implementation Details

```mermaid
graph TB
    subgraph "Main Thread (NestJS)"
        STM[ScraperThreadManager]
        QUEUES[BullMQ Queues]
    end

    subgraph "Worker Thread 1"
        EOW_MAIN[OLX Worker]
        EOW_PUPPETEER[Puppeteer Instance]
        EOW_STEALTH[Stealth Plugin]
        EOW_SELECTORS[OLX Selectors]
    end

    subgraph "Worker Thread 2"
        EOTW_MAIN[Otodom Worker]
        EOTW_PUPPETEER[Puppeteer Instance]
        EOTW_STEALTH[Stealth Plugin]
        EOTW_SELECTORS[Otodom Selectors]
    end

    STM -->|Worker Data<br/>isNewOffersOnly<br/>userAgents| EOW_MAIN
    STM -->|Worker Data<br/>isNewOffersOnly<br/>userAgents| EOTW_MAIN

    EOW_MAIN --> EOW_PUPPETEER
    EOW_PUPPETEER --> EOW_STEALTH
    EOW_STEALTH --> EOW_SELECTORS

    EOTW_MAIN --> EOTW_PUPPETEER
    EOTW_PUPPETEER --> EOTW_STEALTH
    EOTW_STEALTH --> EOTW_SELECTORS

    EOW_MAIN -->|Message<br/>Offer URLs| STM
    EOTW_MAIN -->|Message<br/>Offer URLs| STM

        STM --> QUEUES
```

## Heatmap Service Architecture

The heatmap service provides real-time property density visualization using pre-stored GPS coordinates.

### Database-Driven Approach

```mermaid
flowchart TD
    REQUEST[Heatmap Request] --> QUERY[Database Query]
    QUERY --> FILTER[Filter Available Offers]
    FILTER --> COORDS[Extract Stored Coordinates]
    COORDS --> INTENSITY[Calculate Intensity]
    INTENSITY --> BOUNDS[Generate Map Bounds]
    BOUNDS --> RESPONSE[JSON Response]

    FILTER --> CONDITIONS{Query Conditions}
    CONDITIONS --> CITY[City Filter]
    CONDITIONS --> PRICE[Price Range]
    CONDITIONS --> VIEWS[View Count]
    CONDITIONS --> TYPE[Building Type]
```

### Geocoding Pipeline

```mermaid
flowchart TD
    SCRAPE[Scrape Property Data] --> EXTRACT[AI Address Extraction]
    EXTRACT --> GEOCODE[Nominatim Geocoding]
    GEOCODE --> STORE[Store Coordinates]
    STORE --> HEATMAP[Generate Heatmaps]
    STORE --> NOTIFY[Send Notifications]

    GEOCODE --> FALLBACK{Geocoding Failed?}
    FALLBACK -->|Yes| RETRY[Retry with Variants]
    FALLBACK -->|No| STORE
    RETRY --> CIRCUIT[Circuit Breaker]
    CIRCUIT -->|Open| SKIP[Skip Geocoding]
    CIRCUIT -->|Closed| STORE
```
