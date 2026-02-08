# Services Architecture

This directory contains modular service components that can be loaded individually or together. Each service is self-contained and can be deployed independently if needed.

## Service Structure

### `core.js`
Core Express app setup including:
- Security middleware (Helmet)
- Rate limiting with user bypass
- Session management
- Authentication initialization
- CORS configuration
- Body parsing
- Logging middleware

**Dependencies:** Must be initialized first before other services.

### `staticService.js`
Static file serving:
- HTML pages (index, terms, privacy, cookie)
- Static assets from `public/` directory
- Generated images from `generated_img/` directory
- Favicon handling

### `logoService.js`
Logo generation service:
- `/generate-logo` - Generate logos from text with various styles

**Dependencies:** Requires `core.js` for authentication middleware.

### `faviconService.js`
Favicon generation service:
- `/generate-favicon` - Generate favicons from text
- `/generate-favicon-from-logo` - Generate favicons from existing logos

**Dependencies:** Requires `core.js` for authentication middleware.

### `videoService.js`
Video processing service:
- `/video-converter` - AVI to MP4 converter page
- `/convert-avi-to-mp4` - Convert AVI files to MP4
- `/video-to-gif` - Video to GIF converter page
- `/convert-video-to-gif` - Convert videos to animated GIFs
- `/video-metadata` - Video metadata extractor page
- `/extract-video-metadata` - Extract technical metadata from videos
- `/meme-generator` - Meme generator page
- `/convert-to-meme` - Convert videos/GIFs to memes with various effects

**Dependencies:** Requires `core.js` for authentication middleware. Requires FFmpeg installed on the system.

### `utilityService.js`
Utility endpoints:
- `/health` - Health check endpoint
- `/api/location` - Get user location from IP address
- `/api/usage-limits` - Get user usage limits

**Dependencies:** Requires `core.js` for authentication middleware (for `/api/usage-limits`).

## Usage

### Full Server (Default)
All services are loaded automatically when starting the main server:

```bash
npm start
```

### Individual Service Development
Each service exports an `initialize*` function that takes the Express app:

```javascript
const express = require('express');
const app = express();
const { initializeLogoService } = require('./services/logoService');

// Initialize only logo service
initializeLogoService(app);

app.listen(4000);
```

### Service Order
Services should be initialized in this order:
1. `core.js` - Core middleware and auth (required first)
2. `staticService.js` - Static file serving
3. `logoService.js` - Logo generation
4. `faviconService.js` - Favicon generation
5. `videoService.js` - Video processing
6. `utilityService.js` - Utility endpoints

## Deployment

### Standalone Service Deployment
Each service can be deployed as a separate microservice by creating a minimal server file:

**Example: Logo Service Only**
```javascript
// logo-service-server.js
const express = require('express');
const { initializeCore } = require('./services/core');
const { initializeLogoService } = require('./services/logoService');

const app = express();

(async () => {
  await initializeCore(app);
  initializeLogoService(app);
  
  app.listen(4001, () => {
    console.log('Logo service running on port 4001');
  });
})();
```

This allows you to:
- Scale services independently
- Deploy updates to one service without affecting others
- Isolate failures to specific services
- Use different infrastructure for different services

## Benefits

1. **Modularity**: Each service is self-contained and can be tested independently
2. **Scalability**: Services can be deployed separately and scaled independently
3. **Maintainability**: Easier to find and fix bugs in specific services
4. **Deployment Safety**: Changes to one service don't risk breaking others
5. **Team Collaboration**: Different developers can work on different services

