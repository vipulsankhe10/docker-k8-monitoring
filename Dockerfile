FROM ubuntu

# Install Node.js
RUN apt-get update && apt-get install -y curl && apt-get install -y wget && apt-get install -y python

RUN curl https://dl.google.com/dl/cloudsdk/channels/rapid/google-cloud-sdk.tar.gz -o gcloud.tar.gz && \
  tar zxf gcloud.tar.gz && \
  echo Y | ./google-cloud-sdk/install.sh

RUN \
  cd /tmp && \
  wget http://nodejs.org/dist/v0.10.39/node-v0.10.39-linux-x64.tar.gz && \
  tar -C /usr/local --strip-components 1 -xzf node-v0.10.39-linux-x64.tar.gz && \
  /usr/local/bin/node -v && \
  /usr/local/bin/npm -v

COPY metrics.js /metrics.js
COPY package.json /package.json

RUN npm install

CMD ["node", "/metrics.js"]