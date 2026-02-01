FROM node:18-alpine

ARG GIT_COMMIT_HASH
RUN if [ -z "$GIT_COMMIT_HASH" ]; then echo "ERROR: GIT_COMMIT_HASH build arg is required" && exit 1; fi
ENV GIT_COMMIT_HASH=$GIT_COMMIT_HASH

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps --prefer-offline --no-audit || npm install --legacy-peer-deps --no-audit

COPY . .

RUN npm run build || true

EXPOSE 3001

CMD ["npm", "run", "start"]
