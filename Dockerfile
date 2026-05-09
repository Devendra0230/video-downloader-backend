# Use Node.js as the base image
FROM node:18-slim

# Install Python and other dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip curl ffmpeg unzip ca-certificates && \
    update-ca-certificates && \
    pip3 install --break-system-packages --upgrade yt-dlp

# Deno install
RUN curl -fsSL https://deno.land/x/install/install.sh | sh && \
    mv /root/.deno/bin/deno /usr/local/bin/deno && \
    apt-get clean

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Render exposes the port automatically
EXPOSE 3000

# Start Tor and then start the Node.js server
CMD [ "node", "index.js" ]
