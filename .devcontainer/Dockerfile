# Start with Python base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_INPUT=1 \
    NODE_VERSION=18 \
    NEXT_TELEMETRY_DISABLED=1

# Install system dependencies including Node.js
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
    curl \
    build-essential \
    software-properties-common \
    openssh-server \
    tmux \
    sudo \
    wget \
    git \
    gnupg2 \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    libffi-dev \
    liblzma-dev \
    libgdbm-dev \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnss3-dev \
    libxss-dev \
    libasound2 \
    lsof \
    vim \
    jq \
    supervisor && \
    # Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install net-tools && \
    # Add MongoDB repository
    wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor > /etc/apt/trusted.gpg.d/mongodb-7.0.gpg && \
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
    # Install MongoDB
    apt-get update && \
    apt-get install -y mongodb-org && \
    # Create MongoDB data directory
    mkdir -p /data/db && \
    chown -R root:root /data/db && \
    # Clean up
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN pip install playwright
RUN playwright install chromium
RUN playwright install-deps

RUN curl -fsSL https://code-server.dev/install.sh | sh && \
    # Install any VS Code extensions you want
    code-server --install-extension ms-python.python || echo "Failed to install vscode extension"

RUN mkdir -p /root/.config
COPY .devcontainer/context_params_app_builder.json /root/.config/context_params.json

WORKDIR /app

COPY . /app/

COPY scripts /app/scripts

COPY .devcontainer/supervisord_without_vscode.conf /etc/supervisor/conf.d/supervisord.conf

RUN rm -rf .git

# Set up working directory for internal-library installations
WORKDIR /app

# Install dependencies from the new requirements file
RUN pip install -r requirements.txt

# Remove the new requirements.txt file
RUN rm /app/requirements.txt

# Set up working directory for backend
WORKDIR /app/backend

RUN pip install -r requirements.txt
RUN mkdir -p /app/backend/external_integrations
RUN touch /app/backend/external_integrations/__init__.py

# Set up working directory for frontend
WORKDIR /app/frontend

RUN npm i -g yarn

# Install frontend dependencies
# COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install

# Install ESLint packages globally
# RUN npm install -g @eslint/js@9.20.0 eslint@9.20.0 eslint-plugin-react@7.37.4 globals@15.14.0 \
#     eslint-plugin-jsx-a11y@6.8.0 eslint-plugin-import@2.29.1

# Expose ports
EXPOSE 3000 8001 22 8080 27017
EXPOSE 55000-55999
# Set up entrypoint

RUN eslint --version

WORKDIR /app

RUN chmod +x .devcontainer/entrypoint.sh

ENTRYPOINT [".devcontainer/entrypoint.sh"]
