#!/usr/bin/env bash
# PixelHoops TURN-only relay box (run as root). No domain, no web server, no Node: players reach coturn by IP,
# so it can sit in a mainland China region (e.g. Guangzhou) while the site and API stay on the main server.
#
#   sudo TURN_SECRET=<TURN_SECRET from the main server's /etc/pixelhoops.env> bash setup-turn.sh
#
# Optional: PUBLIC_IP=1.2.3.4 (when auto-detection fails)   TURN_MIN_PORT=49152 TURN_MAX_PORT=50000
# Afterwards put this box first in TURN_HOST on the main server (see tencent/README.md, section 10).
# Works on Debian/Ubuntu (apt) and RHEL-family images such as TencentOS / OpenCloudOS (dnf/yum + EPEL).
# Safe to re-run. Keep the coturn settings in line with turnserver.conf.tpl.
set -euo pipefail

: "${TURN_SECRET:?set TURN_SECRET to the value in the main server's /etc/pixelhoops.env}"
case "$TURN_SECRET" in *[!A-Za-z0-9]*) echo "TURN_SECRET must be letters and digits only"; exit 1 ;; esac
TURN_MIN_PORT="${TURN_MIN_PORT:-49152}"
TURN_MAX_PORT="${TURN_MAX_PORT:-50000}"
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "1/4 coturn"
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y coturn curl
elif command -v dnf >/dev/null || command -v yum >/dev/null; then
  PM="$(command -v dnf || command -v yum)"
  "$PM" install -y epel-release || true
  "$PM" install -y coturn curl
else
  echo "unsupported system: install coturn by hand, then re-run"; exit 1
fi

say "2/4 addresses"
PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS --max-time 5 http://metadata.tencentyun.com/latest/meta-data/public-ipv4 || curl -fsS --max-time 5 https://api.ipify.org || true)}"
[ -n "$PUBLIC_IP" ] || { echo "could not detect the public IP: re-run with PUBLIC_IP=x.x.x.x"; exit 1; }
PRIVATE_IP="$(hostname -I | awk '{print $1}')"
EXT_LINE="external-ip=${PUBLIC_IP}"
if [ -n "$PRIVATE_IP" ] && [ "$PRIVATE_IP" != "$PUBLIC_IP" ]; then EXT_LINE="external-ip=${PUBLIC_IP}/${PRIVATE_IP}"; fi
echo "public $PUBLIC_IP   private ${PRIVATE_IP:-?}"

say "3/4 config + service"
CONF=/etc/turnserver.conf
if [ -d /etc/coturn ]; then CONF=/etc/coturn/turnserver.conf; fi
if [ -f "$CONF" ] && [ ! -f "$CONF.orig" ]; then cp -p "$CONF" "$CONF.orig"; fi
touch "$CONF"
chmod 640 "$CONF"
for g in turnserver coturn; do
  if getent group "$g" >/dev/null; then chgrp "$g" "$CONF"; fi
done
cat > "$CONF" <<CONF
# coturn for PixelHoops (relay-only box). Credentials are minted by the main server (GET /api/turn) with the shared secret.
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$PUBLIC_IP
$EXT_LINE
min-port=$TURN_MIN_PORT
max-port=$TURN_MAX_PORT
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1
# game traffic is small: cap abuse per user / globally (bps)
user-quota=6
total-quota=300
max-bps=1500000
bps-capacity=200000000
# never relay into private networks (SSRF / lateral movement)
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
syslog
simple-log
CONF
if [ -f /etc/default/coturn ]; then
  sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi
systemctl enable coturn
systemctl restart coturn
sleep 2
systemctl is-active --quiet coturn || { echo "!! coturn did not start: journalctl -u coturn -n 50"; exit 1; }

say "4/4 host firewall (only if one is already on; ALSO open the same ports in the Tencent Cloud console)"
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 3478/tcp >/dev/null; ufw allow 3478/udp >/dev/null; ufw allow "${TURN_MIN_PORT}:${TURN_MAX_PORT}/udp" >/dev/null
  echo "ufw: opened"
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd -q --permanent --add-port=3478/tcp --add-port=3478/udp --add-port="${TURN_MIN_PORT}-${TURN_MAX_PORT}/udp"
  firewall-cmd -q --reload
  echo "firewalld: opened"
else
  echo "no active host firewall, nothing to change"
fi

cat <<DONE

Done. coturn is relaying on $PUBLIC_IP:3478 (logs: journalctl -u coturn -f).

1) Tencent Cloud console firewall / security group for this box must allow:
     TCP 3478    UDP 3478    UDP ${TURN_MIN_PORT}-${TURN_MAX_PORT}
2) On the main server, hand this box out first and restart the backend:
     sed -i 's/^TURN_HOST=.*/TURN_HOST=$PUBLIC_IP,<previous TURN_HOST value>/' /etc/pixelhoops.env
     systemctl restart pixelhoops
DONE
