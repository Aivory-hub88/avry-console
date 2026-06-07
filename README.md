# avry-console

AI Console for the Aivory platform — conversational AI assistant for business consultation.

## Tech Stack

- Next.js (TypeScript)
- Tailwind CSS
- Supabase
- Docker

## Directory Structure

```
avry-console/
├── app/            # Next.js app directory
├── components/     # React components
├── config/         # Configuration
├── contexts/       # React contexts
├── hooks/          # Custom hooks
├── lib/            # Utility libraries
├── pages/          # Page routes
├── services/       # API service layer
├── styles/         # Global styles
├── types/          # TypeScript types
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

The service runs on port **8086**.

## Docker

```bash
docker compose up --build
```

## VPS Deployment

```bash
docker compose -f docker-compose.yml up -d --build
```

Ensure `.env` is configured on the server with production credentials.

## Part of Aivory

This service is part of the [Aivory platform](https://github.com/ClementHansel/aivory).
