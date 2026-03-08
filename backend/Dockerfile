FROM python:3.11-slim

WORKDIR /app

# Install WireGuard tools
RUN apt-get update && \
    apt-get install -y wireguard-tools iproute2 && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create directory for WireGuard configs
RUN mkdir -p /etc/wireguard

# Run as non-root user (note: WireGuard operations require elevated privileges)
# For production, you'll need to run with appropriate capabilities

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
