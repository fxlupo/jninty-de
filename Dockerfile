FROM node:22-alpine AS build
RUN apk add --no-cache git
WORKDIR /src

ARG JNINTY_REF=main
RUN git clone --depth 1 --branch ${JNINTY_REF} https://github.com/fxlupo/jninty-de.git .

RUN npm ci
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80
