# Login page background image

Place your image file here so the login page uses it as the background:

- **Filename:** `login-background.jpg` (or `login-background.png`)
- **Location:** this folder (`client/public/`)
- **Recommended size:** 1920×1080 or similar; the image is shown with `background-size: cover`.

The app will use `/login-background.jpg` by default. Old Unsplash URLs in the browser are ignored so the local image is shown after deploy.

**On the server:** Add `login-background.jpg` to `client/public/` (or the same path in your deploy), then run `npm run build` so the file is included in the build output.
