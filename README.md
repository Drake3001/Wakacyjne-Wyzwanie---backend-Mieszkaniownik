# Mieszkaniownik Architecture

## System Overview

```mermaid
graph TB
    %% Styling
    classDef websiteClass fill:#eff6ff,stroke:#93c5fd,stroke-width:2px
    classDef workerClass fill:#fefce8,stroke:#fde047,stroke-width:2px
    classDef queueClass fill:#eff6ff,stroke:#93c5fd,stroke-width:2px
    classDef processorClass fill:#fefce8,stroke:#fde047,stroke-width:2px
    classDef serviceClass fill:#eff6ff,stroke:#93c5fd,stroke-width:2px
    classDef coreClass fill:#fefce8,stroke:#fde047,stroke-width:2px
    classDef externalClass fill:#eff6ff,stroke:#93c5fd,stroke-width:2px

    subgraph WEBSITES["Target Websites"]
        OLX[OLX.pl]
        OTODOM[Otodom.pl]
    end

    subgraph NESTJS["NestJS Application"]
        direction TB

        subgraph ORCHESTRATION["Orchestration"]
            SS[ScraperService<br/>Cron Scheduler]
            STM[ScraperThreadManager]
        end

        subgraph WORKERS["Worker Threads"]
            OW[OLX Worker<br/>Puppeteer + Stealth]
            OTW[Otodom Worker<br/>Puppeteer + Stealth]
        end

        subgraph QUEUES["BullMQ Queues"]
            OEQ[(olx-existing<br/>Priority: 5)]
            ONQ[(olx-new<br/>Priority: 1 HIGH)]
            OTEQ[(otodom-existing<br/>Priority: 5)]
            OTNQ[(otodom-new<br/>Priority: 1 HIGH)]
        end

        subgraph PROCESSORS["Queue Processors"]
            SYS_OEP[OlxExisting<br/>Processor]
            SYS_ONP[OlxNew<br/>Processor]
            SYS_OTEP[OtodomExisting<br/>Processor]
            SYS_OTNP[OtodomNew<br/>Processor]
            SYS_SP[Scraper<br/>Processor<br/>Core Logic]
        end

        subgraph SERVICES["Support Services"]
            AI[AI Address<br/>Extractor]
            BS[Browser<br/>Setup]
            PP[Parameter<br/>Parser]
        end

        subgraph CORE["Core Modules"]
            DM[Database<br/>Prisma ORM]
            MM[Match<br/>Module]
            NM[Notification<br/>Module]
            HM[Heatmap<br/>Module]
            AM[Auth<br/>JWT/OAuth]
            UM[User<br/>Module]
        end
    end

    subgraph EXTERNAL["External Services"]
        REDIS[(Redis)]
        POSTGRES[(PostgreSQL)]
        GOOGLE[Google AI<br/>Gemini]
        NOMINATIM[Nominatim<br/>OSM]
        GMAPS[Google<br/>Maps]
        EMAIL[Gmail<br/>SMTP]
        DISCORD[Discord<br/>API]
    end

    %% Flow connections
    SS --> STM
    STM --> OW
    STM --> OTW

    OW -.->|scrape| OLX
    OTW -.->|scrape| OTODOM

    OW --> OEQ & ONQ
    OTW --> OTEQ & OTNQ

    OEQ --> SYS_OEP
    ONQ --> SYS_ONP
    OTEQ --> SYS_OTEP
    OTNQ --> SYS_OTNP

    SYS_OEP & SYS_ONP & SYS_OTEP & SYS_OTNP --> SYS_SP

    SYS_SP --> AI & BS & PP

    AI --> GOOGLE
    BS -.->|retry| OLX & OTODOM
    SYS_SP --> NOMINATIM
    SYS_SP --> DM

    DM --> POSTGRES
    MM --> POSTGRES
    MM --> NM
    NM --> EMAIL & DISCORD & GMAPS

    OEQ & ONQ & OTEQ & OTNQ -.->|store| REDIS

    %% Apply styles
    class OLX,OTODOM websiteClass
    class OW,OTW workerClass
    class OEQ,ONQ,OTEQ,OTNQ queueClass
    class SYS_OEP,SYS_ONP,SYS_OTEP,SYS_OTNP,SYS_SP processorClass
    class AI,BS,PP serviceClass
    class DM,MM,NM,HM,AM,UM coreClass
    class REDIS,POSTGRES,GOOGLE,NOMINATIM,GMAPS,EMAIL,DISCORD externalClass
```

## Multi-Threading Architecture Details

```mermaid
sequenceDiagram
    autonumber
    actor User as App Start
    box NestJS Application
        participant SS as ScraperService
        participant STM as ThreadManager
    end
    box Worker Threads
        participant OW as OLX Worker
        participant OTW as Otodom Worker
    end
    box External Sites
        participant OLX as OLX.pl
        participant OTODOM as Otodom.pl
    end
    box BullMQ Queues
        participant QE as Existing Queues<br/>(Priority: 5)
        participant QN as New Queues<br/>(Priority: 1)
    end
    box Processors
        participant PROC as Queue Processors
        participant SP as ScraperProcessor
    end
    participant DB as Database

    rect rgb(220, 240, 255)
        Note over User,DB: Phase 1: Startup - Existing Offers (5s delay)
        User->>SS: onModuleInit()
        SS->>STM: startExistingOffersWorkers()

        par Parallel Scraping
            STM->>OW: Spawn Worker (isNew: false)
            OW->>OLX: Scrape pages 1-25
            OLX-->>OW: Offer URLs
            OW->>QE: Queue URLs
            QE->>PROC: Consume (P:5)
            PROC->>SP: Process offers
            SP-->>DB: Save (isNew: false)
        and
            STM->>OTW: Spawn Worker (isNew: false)
            OTW->>OTODOM: Scrape pages 1-500
            OTODOM-->>OTW: Offer URLs
            OTW->>QE: Queue URLs
            QE->>PROC: Consume (P:5)
            PROC->>SP: Process offers
            SP-->>DB: Save (isNew: false)
        end
    end

    rect rgb(240, 255, 240)
        Note over User,DB: Phase 2: Continuous - New Offers (Every Minute)
        SS->>STM: startNewOffersWorkers()

        par High Priority Scraping
            STM->>OW: Spawn Worker (isNew: true)
            OW->>OLX: Scrape PAGE 1 ONLY
            OLX-->>OW: Latest URLs
            OW->>QN: Queue (HIGH Priority)
            QN->>PROC: Consume (P:1)
            PROC->>SP: Process offers
            SP-->>DB: Save (isNew: true)
        and
            STM->>OTW: Spawn Worker (isNew: true)
            OTW->>OTODOM: Scrape PAGE 1 ONLY
            OTODOM-->>OTW: Latest URLs
            OTW->>QN: Queue (HIGH Priority)
            QN->>PROC: Consume (P:1)
            PROC->>SP: Process offers
            SP-->>DB: Save (isNew: true)
        end
    end

    rect rgb(255, 250, 230)
        Note over User,DB: Phase 3: Full Refresh (Every Hour)
        SS->>STM: scrapeWithBothThreads(25, 500)
        Note over STM: Triggers complete scraping cycle
    end
```

## Technology Stack & Frameworks

```mermaid
graph LR
    %% Styling
    classDef coreClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:3px,color:#1e3a8a
    classDef dbClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef queueClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef scrapeClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef aiClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef mapClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef authClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef notifClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12

    subgraph CORE["Core Framework"]
        NEST[NestJS v10+<br/>TypeScript<br/>DI Container]
    end

    subgraph DB["Data Persistence"]
        PRISMA[Prisma ORM<br/>Type-safe]
        PG[(PostgreSQL<br/>Database)]
    end

    subgraph QUEUE["Job Queue System"]
        BULLMQ[BullMQ<br/>Job Processing]
        REDIS[(Redis<br/>In-memory)]
    end

    subgraph SCRAPE["Web Scraping"]
        PUPPETEER[Puppeteer<br/>Headless Chrome]
        STEALTH[Stealth Plugin<br/>Anti-detection]
        WORKER[Worker Threads<br/>Parallelism]
    end

    subgraph AI["AI & Geocoding"]
        GOOGLE_AI[Google Gemini<br/>Address NLP]
        NOMINATIM[Nominatim<br/>Geocoding]
        SCHEDULER[Node-cron<br/>Scheduling]
    end

    subgraph MAPS["Maps & Visualization"]
        GMAPS[Google Maps<br/>Static API]
        HEATMAP[Leaflet<br/>Heatmaps]
    end

    subgraph AUTH["Authentication"]
        JWT[JWT Tokens]
        OAUTH[Google OAuth2]
        PASSPORT[Passport.js]
    end

    subgraph NOTIF["Notifications"]
        NODEMAILER[Nodemailer<br/>Email]
        DISCORD[Discord.js<br/>Bot API]
    end

    %% Connections
    NEST --> PRISMA & BULLMQ & PUPPETEER & WORKER & GOOGLE_AI & NOMINATIM & SCHEDULER & JWT & OAUTH & PASSPORT & NODEMAILER & DISCORD & GMAPS & HEATMAP
    PRISMA --> PG
    BULLMQ --> REDIS
    PUPPETEER --> STEALTH

    %% Apply styles
    class NEST coreClass
    class PRISMA,PG dbClass
    class BULLMQ,REDIS queueClass
    class PUPPETEER,STEALTH,WORKER scrapeClass
    class GOOGLE_AI,NOMINATIM,SCHEDULER aiClass
    class GMAPS,HEATMAP mapClass
    class JWT,OAUTH,PASSPORT authClass
    class NODEMAILER,DISCORD notifClass
```

## Database Schema & Data Flow

```mermaid
erDiagram
    User ||--o{ Alert : "creates"
    User ||--o{ Notification : "receives"
    Alert ||--o{ Match : "generates"
    Offer ||--o{ Match : "triggers"
    Match ||--o{ Notification : "sends"

    User {
        int id PK "Primary Key"
        string email UK "Unique Email"
        string name "User Name"
        string provider "OAuth Provider"
        datetime createdAt "Created"
        datetime updatedAt "Updated"
        boolean isArchived "Archived Status"
    }

    Alert {
        int id PK "Primary Key"
        int userId FK "User Reference"
        string name "Alert Name"
        string city "City"
        int minPrice "Min Price"
        int maxPrice "Max Price"
        int minRooms "Min Rooms"
        int maxRooms "Max Rooms"
        int minFootage "Min m²"
        int maxFootage "Max m²"
        boolean elevator "Elevator"
        boolean furnished "Furnished"
        boolean pets "Pets Allowed"
        boolean parking "Parking"
        string[] keywords "Keywords"
        boolean isActive "Active Status"
        datetime createdAt "Created"
        datetime updatedAt "Updated"
    }

    Offer {
        int id PK "Primary Key"
        string title "Title"
        string description "Description"
        string link UK "Unique URL"
        int price "Price"
        string city "City"
        string street "Street"
        string streetNumber "Number"
        string district "District"
        string estateName "Estate"
        decimal latitude "GPS Lat"
        decimal longitude "GPS Lng"
        int rooms "Rooms"
        int footage "Area m²"
        string buildingType "Type"
        boolean elevator "Elevator"
        boolean furnished "Furnished"
        boolean pets "Pets"
        boolean parking "Parking"
        string[] images "Image URLs"
        string source "Source Site"
        int views "View Count"
        string viewsMethod "View Method"
        boolean isNew "New Flag"
        boolean available "Available"
        datetime createdAt "Created"
        datetime updatedAt "Updated"
    }

    Match {
        int id PK "Primary Key"
        int alertId FK "Alert Reference"
        int offerId FK "Offer Reference"
        float score "Match Score"
        boolean notified "Notification Sent"
        datetime createdAt "Created"
    }

    Notification {
        int id PK "Primary Key"
        int userId FK "User Reference"
        int matchId FK "Match Reference"
        string type "Type"
        string channel "Channel"
        string status "Status"
        string content "Content"
        datetime sentAt "Sent Time"
        datetime createdAt "Created"
    }
```

## Scraping Algorithm Flow

```mermaid
flowchart TB
    %% Styling
    classDef startClass fill:#fef08a,stroke:#facc15,stroke-width:3px,color:#713f12
    classDef orchestratorClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef workerClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef queueClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef processorClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef serviceClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px
    classDef dbClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef notifyClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef cronClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef endClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a

    START([App Start<br/>+5s delay])
    START --> INIT[Init Service<br/>startExistingWorkers]
    INIT --> SPAWN_EXIST[Spawn 2 Threads]

    SPAWN_EXIST --> SPLIT_EXIST{ }
    SPLIT_EXIST --> OLX_EXIST[OLX Worker<br/>isNew: false]
    SPLIT_EXIST --> OTDM_EXIST[Otodom Worker<br/>isNew: false]

    OLX_EXIST --> OLX_SCRAPE[Scrape 25 pages<br/>Extract URLs]
    OTDM_EXIST --> OTDM_SCRAPE[Scrape 500 pages<br/>Extract URLs]

    OLX_SCRAPE --> OLX_Q[olx-existing<br/>P:5]
    OTDM_SCRAPE --> OTDM_Q[otodom-existing<br/>P:5]

    OLX_Q --> OLX_PROC[OlxExistingProc]
    OTDM_Q --> OTDM_PROC[OtodomExistingProc]

    OLX_PROC --> MERGE_EXIST{ }
    OTDM_PROC --> MERGE_EXIST

    MERGE_EXIST --> CRON_MIN([Every Minute<br/>Cron Job])
    CRON_MIN --> NEW_INIT[Start New Workers]
    NEW_INIT --> SPAWN_NEW[Spawn 2 Threads]

    SPAWN_NEW --> SPLIT_NEW{ }
    SPLIT_NEW --> OLX_NEW[OLX Worker<br/>isNew: true]
    SPLIT_NEW --> OTDM_NEW[Otodom Worker<br/>isNew: true]

    OLX_NEW --> OLX_NEW_SCRAPE[Scrape PAGE 1<br/>Latest URLs]
    OTDM_NEW --> OTDM_NEW_SCRAPE[Scrape PAGE 1<br/>Latest URLs]

    OLX_NEW_SCRAPE --> OLX_NEW_Q[olx-new<br/>P:1 HIGH]
    OTDM_NEW_SCRAPE --> OTDM_NEW_Q[otodom-new<br/>P:1 HIGH]

    OLX_NEW_Q --> OLX_NEW_PROC[OlxNewProc]
    OTDM_NEW_Q --> OTDM_NEW_PROC[OtodomNewProc]

    OLX_NEW_PROC --> MERGE_NEW{ }
    OTDM_NEW_PROC --> MERGE_NEW

    MERGE_NEW --> MAIN_PROC[ScraperProcessor<br/>Main Logic]

    MAIN_PROC --> BROWSER[Browser Setup<br/>Puppeteer + Stealth]
    BROWSER --> PARSE[Parse Parameters<br/>Extract Data]
    PARSE --> AI[AI Extraction<br/>Google Gemini]
    AI --> GEO[Geocoding<br/>Nominatim OSM]
    GEO --> SAVE[Save to DB<br/>PostgreSQL]
    SAVE --> MATCH[Match Check<br/>Score Calculation]
    MATCH --> DECISION{Match Found?}

    DECISION -->|Yes| NOTIFY[Send Notification<br/>Email + Discord]
    DECISION -->|No| END[Job Complete]
    NOTIFY --> END

    CRON_HOUR([Every Hour<br/>Full Refresh])
    CRON_HOUR --> FULL[Full Scrape<br/>scrapeWithBothThreads]
    FULL --> SPAWN_EXIST
    END --> CRON_MIN

    %% Apply styles
    class START startClass
    class INIT,NEW_INIT,FULL orchestratorClass
    class OLX_EXIST,OTDM_EXIST,OLX_NEW,OTDM_NEW,OLX_SCRAPE,OTDM_SCRAPE,OLX_NEW_SCRAPE,OTDM_NEW_SCRAPE workerClass
    class OLX_Q,OTDM_Q,OLX_NEW_Q,OTDM_NEW_Q queueClass
    class OLX_PROC,OTDM_PROC,OLX_NEW_PROC,OTDM_NEW_PROC,MAIN_PROC processorClass
    class BROWSER,PARSE,AI,GEO serviceClass
    class SAVE,MATCH dbClass
    class NOTIFY notifyClass
    class CRON_MIN,CRON_HOUR cronClass
    class END endClass
```

## Worker Thread Implementation Details

```mermaid
graph TB
    %% Styling
    classDef mainClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef workerClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef queueClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef processorClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef dataClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px
    classDef browserClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12

    subgraph MAIN["Main Thread - NestJS Application"]
        direction TB
        SS[ScraperService<br/>Cron Orchestrator]
        STM[ThreadManager<br/>Worker Management]

        SS --> STM

        subgraph QUEUES["BullMQ Queue System"]
            direction LR
            OEQ[(olx-existing<br/>P:5)]
            ONQ[(olx-new<br/>P:1)]
            OTEQ[(otodom-existing<br/>P:5)]
            OTNQ[(otodom-new<br/>P:1)]
        end

        subgraph PROC["Queue Processors"]
            direction TB
            OEP[OlxExisting]
            ONP[OlxNew]
            OTEP[OtodomExisting]
            OTNP[OtodomNew]
            SP[ScraperProcessor<br/>Core Logic]

            OEP --> SP
            ONP --> SP
            OTEP --> SP
            OTNP --> SP
        end
    end

    subgraph WT1["Worker Thread 1: olx-worker.ts"]
        direction TB
        OW[Entry Point]
        OW_DATA[Worker Data<br/>• pageNum<br/>• sortOrder<br/>• baseUrl<br/>• userAgents<br/>• isNewOffersOnly]
        OW_PUPPET[Puppeteer<br/>+ Stealth Plugin]
        OW_LOGIC[Scraping Logic<br/>Navigate & Extract]

        OW --> OW_DATA
        OW_DATA --> OW_PUPPET
        OW_PUPPET --> OW_LOGIC
    end

    subgraph WT2["Worker Thread 2: otodom-worker.ts"]
        direction TB
        OTW[Entry Point]
        OTW_DATA[Worker Data<br/>• pageNum<br/>• baseUrl<br/>• userAgents<br/>• isNewOffersOnly]
        OTW_PUPPET[Puppeteer<br/>+ Stealth Plugin]
        OTW_LOGIC[Scraping Logic<br/>Navigate & Extract]

        OTW --> OTW_DATA
        OTW_DATA --> OTW_PUPPET
        OTW_PUPPET --> OTW_LOGIC
    end

    %% Main Thread spawns Workers
    STM -.->|spawn| OW
    STM -.->|spawn| OTW

    %% Workers return to Main Thread
    OW_LOGIC -.->|URLs| STM
    OTW_LOGIC -.->|URLs| STM

    %% Main Thread queues URLs
    STM --> OEQ & ONQ & OTEQ & OTNQ

    %% Queues to Processors
    OEQ --> OEP
    ONQ --> ONP
    OTEQ --> OTEP
    OTNQ --> OTNP

    %% Apply styles
    class SS,STM mainClass
    class OW,OTW,OW_LOGIC,OTW_LOGIC workerClass
    class OEQ,ONQ,OTEQ,OTNQ queueClass
    class OEP,ONP,OTEP,OTNP,SP processorClass
    class OW_DATA,OTW_DATA dataClass
    class OW_PUPPET,OTW_PUPPET browserClass
```

## Heatmap Service Architecture

### Database Flow

```mermaid
flowchart TD
    %% Styling
    classDef requestClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef queryClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef processClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef filterClass fill:#fef08a,stroke:#facc15,stroke-width:2px
    classDef responseClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a

    REQUEST[Heatmap Request<br/>Client API Call]
    QUERY[Database Query<br/>PostgreSQL]
    FILTER[Filter Offers<br/>Available Only]
    COORDS[Extract GPS<br/>Coordinates]
    INTENSITY[Calculate<br/>Density Intensity]
    BOUNDS[Generate<br/>Map Bounds]
    RESPONSE[JSON Response<br/>Heatmap Data]

    CONDITIONS{Query<br/>Conditions}
    CITY[City Filter]
    PRICE[Price Range]
    VIEWS[View Count]
    TYPE[Building Type]

    REQUEST --> QUERY
    QUERY --> FILTER
    FILTER --> COORDS
    COORDS --> INTENSITY
    INTENSITY --> BOUNDS
    BOUNDS --> RESPONSE

    FILTER --> CONDITIONS
    CONDITIONS --> CITY & PRICE & VIEWS & TYPE

    %% Apply styles
    class REQUEST requestClass
    class QUERY queryClass
    class FILTER,CONDITIONS filterClass
    class COORDS,INTENSITY,BOUNDS processClass
    class RESPONSE responseClass
```

### Geocoding Pipeline

```mermaid
flowchart TD
    %% Styling
    classDef scrapeClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef aiClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef geocodeClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef storeClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef outputClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12
    classDef errorClass fill:#bfdbfe,stroke:#60a5fa,stroke-width:2px,color:#1e3a8a
    classDef skipClass fill:#fef08a,stroke:#facc15,stroke-width:2px,color:#713f12

    SCRAPE[Scrape Data<br/>Property Info]
    EXTRACT[AI Extraction<br/>Google Gemini]
    GEOCODE[Geocoding<br/>Nominatim OSM]
    STORE[Store Coords<br/>PostgreSQL]
    HEATMAP[Generate<br/>Heatmaps]
    NOTIFY[Send<br/>Notifications]

    FALLBACK{Geocoding<br/>Failed?}
    RETRY[Retry<br/>Address Variants]
    CIRCUIT{Circuit<br/>Breaker}
    SKIP[Skip<br/>Geocoding]

    SCRAPE --> EXTRACT
    EXTRACT --> GEOCODE
    GEOCODE --> FALLBACK

    FALLBACK -->|Success| STORE
    FALLBACK -->|Failed| RETRY

    RETRY --> CIRCUIT
    CIRCUIT -->|Open| SKIP
    CIRCUIT -->|Closed| STORE

    STORE --> HEATMAP & NOTIFY

    %% Apply styles
    class SCRAPE scrapeClass
    class EXTRACT aiClass
    class GEOCODE geocodeClass
    class STORE storeClass
    class HEATMAP,NOTIFY outputClass
    class FALLBACK,RETRY,CIRCUIT errorClass
    class SKIP skipClass
```
