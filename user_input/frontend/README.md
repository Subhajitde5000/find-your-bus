# KonBus Community Desk frontend

Next.js app for the community feedback portal. It has a landing page, the feature suggestion page (`/suggest-feature`), bus data report page (`/report-data`), admin sign-in (`/admin/login`), and the protected admin inbox (`/admin`).

## Run locally

```bash
cd user_input/frontend
npm install
npm run dev
```

The browser talks to relative `/api/...` URLs. `next.config.ts` forwards those requests to `USER_INPUT_API_URL` or `http://127.0.0.1:8000` by default. Start the FastAPI app in `../backend` as well. The dev and build scripts explicitly use Webpack so they also work on systems where Next.js cannot load Turbopack's native platform binding (including Windows setups that fall back to WASM). Do not put Mongo credentials or admin secrets in this frontend.
