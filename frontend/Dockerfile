FROM node:18-alpine

ARG REACT_APP_API_URL
RUN if [ -z "$REACT_APP_API_URL" ]; then echo "ERROR: REACT_APP_API_URL build arg is required" && exit 1; fi
ENV REACT_APP_API_URL=$REACT_APP_API_URL

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps --prefer-offline --no-audit || npm install --legacy-peer-deps --no-audit

COPY . .

# Build with npm
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
