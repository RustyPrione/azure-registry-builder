FROM node:20

WORKDIR /app

# install dependencies
RUN apt-get update && \
    apt-get install -y curl git ca-certificates

# install Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# COPY package*.json ./

# RUN npm install

COPY . .

EXPOSE 3000

CMD ["node","server.js"]