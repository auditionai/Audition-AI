import type { Handler } from "@netlify/functions";

// This function is deprecated. The logic has been moved to generate-group-image-background.ts
// The client should call the endpoint with the "-background" suffix directly.
export const handler: Handler = async () => {
  return {
    statusCode: 410, // Gone
    body: JSON.stringify({ 
        error: "This API endpoint is deprecated and no longer in use. Please update the client to call the '/.netlify/functions/generate-group-image-background' endpoint." 
    }),
  };
};
