// Speed Insights initialization for Vercel
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Speed Insights
// This will automatically track page views and web vitals
// The tracking only works in production (on Vercel), not in development mode
injectSpeedInsights({
  debug: false, // Set to true if you want to see debug logs in development
});

export { injectSpeedInsights };
