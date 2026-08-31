/**
 * Limits shared by the browser and the server.
 *
 * Its own module because the vision parser imports the Anthropic SDK, and the
 * component that resizes the photo has no business pulling that into the
 * browser bundle.
 */
export const MAX_IMAGES = 3;
