# Multi-stage / lightweight Node.js Dockerfile for Congklak 1 vs 1 Multiplayer
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy all application files
COPY . .

# Expose server port (HTTP + WebSocket)
EXPOSE 9090

# Set environment
ENV NODE_ENV=production
ENV PORT=9090

# Start server
CMD ["npm", "start"]
