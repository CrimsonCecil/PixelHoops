map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 80;
    listen [::]:80;
    server_name __NAMES__;

    client_max_body_size 100m;          # replays up to 90 MB
    gzip on;
    gzip_types text/css application/javascript text/javascript application/json image/svg+xml;

    # WebSocket relay: low latency, long-lived
    location ~ ^/api/rooms/[^/]+/ws$ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        tcp_nodelay on;
    }

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, so clients cannot spoof it to dodge /api/turn rate limit
        proxy_set_header X-Forwarded-Proto $scheme;      # server.mjs uses it to rewrite __API_BASE__ with the right scheme
        proxy_request_buffering off;
        proxy_read_timeout 120s;
    }
}
