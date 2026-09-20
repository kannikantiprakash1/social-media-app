FROM node:18-alpine

WORKDIR /app

RUN npm install -g http-server

COPY index.html .

EXPOSE 80

CMD ["http-server", "-p", "80"]
