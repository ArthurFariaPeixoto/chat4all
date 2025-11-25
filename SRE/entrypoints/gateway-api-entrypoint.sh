#!/bin/sh
set -e

echo "================================================"
echo "🚀 Gateway API - Starting Development Environment"
echo "================================================"

echo "🔄 Checking bcrypt compatibility..."
# Reinstalar bcrypt para garantir compatibilidade com Alpine Linux
# Isso resolve o erro "Exec format error" causado por binários do Windows montados via volume
npm uninstall bcrypt
npm install bcrypt

echo "🔄 Installing dependencies..."
npm install

echo "🔄 Generating Prisma Client..."
npx prisma generate

echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "🚀 Starting NestJS application..."
npm run start:dev

