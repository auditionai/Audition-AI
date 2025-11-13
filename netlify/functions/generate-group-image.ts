// This function has been moved to generate-group-image-background.ts to be correctly handled by Netlify as a background function.
// This file is now deprecated. The correct endpoint to call is still '/.netlify/functions/generate-group-image'.

import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  return {
    statusCode: 410, // Gone
    body: JSON.stringify({ error: "This function is deprecated. Please use the '/.netlify/functions/generate-group-image' endpoint which triggers the background function." }),
  };
};
