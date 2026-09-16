Customer screenshots for the landing page proof wall.

## Adding one

Drop the image file in this folder and commit. That is the whole job — the
next build indexes this folder and the picture is on the page. No code change.

  - Any format: png, jpg, webp, avif, gif.
  - Any shape. The wall lays them out in masonry columns and shows each at its
    own aspect ratio; nothing is cropped.
  - Order is filename order. Prefix 01-, 02- to control it.

## Captions (optional)

Add a captions.json in this folder:

    {
      "01-mike.png": "PSA Birth Certificate, delivered to Isabela",
      "02-airah.png": "Natanggap na po ang PSA ng anak ko"
    }

Any filename it names gets that line under the picture. Anything it does not
name simply has no caption. A broken captions.json is ignored, not fatal.

## Before you upload

These are published exactly as supplied — uncropped, unedited. That is what
makes them convincing, and it also means everything in the frame goes onto a
public, Google-indexed page:

  - the sender's full name and profile photo
  - any PSA certificate legible in their photo — names, birth dates,
    birthplaces, parents' names
  - our own tooling caught in the shot: "Assign this conversation", the
    AI suggested-reply box, staff names, internal ad and order references

Crop those out before the file goes in here, not after.
