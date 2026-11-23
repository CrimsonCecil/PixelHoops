#!/usr/bin/env bash
# PixelHoops one-shot installer for Tencent Cloud Lighthouse (Ubuntu 22.04 / 24.04, run as root).
#
#   sudo API_DOMAIN=pixelhoops-api.kccecil.com EMAIL=you@example.com bash setup.sh
#
# Optional: WEB_DOMAIN=ph-test.kccecil.com  -> also serve the static front-end from this box (index.html is
#           rewritten to call this same origin; set SELF_API=0 for the real front-end domain you do NOT want rewritten)
#           REPO_URL=https://github.com/CrimsonCecil/PixelHoops.git  BRANCH=tencent-cloud
#           TURN_MIN_PORT=49152 TURN_MAX_PORT=50000
#           EXTRA_DOMAINS="ph-test.kccecil.com"   -> more server names on the same nginx + certificate (space separated)
#
# Safe to re-run: it never overwrites an existing TURN secret or the SQLite database.
set -euo pipefail

: "${API_DOMAIN:?set API_DOMAIN, e.g. pixelhoops-api.kccecil.com}"
: "${EMAIL:?set EMAIL for the TLS certificate}"
REPO_URL="${REPO_URL:-https://github.com/CrimsonCecil/PixelHoops.git}"
BRANCH="${BRANCH:-main}"
WEB_DOMAIN="${WEB_DOMAIN:-}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-}"
TURN_MIN_PORT="${TURN_MIN_PORT:-49152}"
TURN_MAX_PORT="${TURN_MAX_PORT:-50000}"
APP_USER=pixelhoops
APP_DIR=/opt/pixelhoops
ENV_FILE=/etc/pixelhoops.env

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "1/8 packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git nginx certbot python3-certbot-nginx coturn ufw dnsutils sqlite3

say "2/8 Node.js 22 (needs >= 22.13 for node:sqlite)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

say "3/8 app user + code"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
if [ -d "$APP_DIR/app/.git" ]; then
  git -C "$APP_DIR/app" fetch --depth 1 origin "$BRANCH" && git -C "$APP_DIR/app" checkout -B "$BRANCH" FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR/app"
fi
mkdir -p "$APP_DIR/data"
( cd "$APP_DIR/app/tencent" && npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund )
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

say "4/8 secrets + env"
PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org || curl -fsS --max-time 5 http://metadata.tencentyun.com/latest/meta-data/public-ipv4 || true)"
PRIVATE_IP="$(hostname -I | awk '{print $1}')"
if [ -f "$ENV_FILE" ] && grep -q '^TURN_SECRET=' "$ENV_FILE"; then
  TURN_SECRET="$(grep '^TURN_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
else
  TURN_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi
cat > "$ENV_FILE" <<ENV
PORT=8787
HOST=127.0.0.1
DB_FILE=$APP_DIR/data/pixelhoops.db
TURN_SECRET=$TURN_SECRET
TURN_HOST=$API_DOMAIN
TURN_PORT=3478
TURN_TLS_PORT=0
$( [ -n "$WEB_DOMAIN" ] && printf "STATIC_DIR=%s/app\nSELF_API=%s" "$APP_DIR" "${SELF_API:-1}" )
ENV
chmod 640 "$ENV_FILE"; chown root:"$APP_USER" "$ENV_FILE"

say "5/8 systemd service"
install -m 644 "$APP_DIR/app/tencent/deploy/pixelhoops.service" /etc/systemd/system/pixelhoops.service
systemctl daemon-reload
systemctl enable --now pixelhoops
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo

say "6/8 coturn"
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
EXT_LINE="external-ip=${PUBLIC_IP}"
[ -n "$PRIVATE_IP" ] && [ "$PRIVATE_IP" != "$PUBLIC_IP" ] && EXT_LINE="external-ip=${PUBLIC_IP}/${PRIVATE_IP}"
sed -e "s|__REALM__|$API_DOMAIN|" -e "s|__SECRET__|$TURN_SECRET|" -e "s|__EXTERNAL_IP_LINE__|$EXT_LINE|" \
    -e "s|__MIN__|$TURN_MIN_PORT|" -e "s|__MAX__|$TURN_MAX_PORT|" \
    "$APP_DIR/app/tencent/deploy/turnserver.conf.tpl" > /etc/turnserver.conf
systemctl enable coturn && systemctl restart coturn

say "7/8 nginx + TLS"
DOMAINS=(-d "$API_DOMAIN"); NAMES="$API_DOMAIN"
for d in $WEB_DOMAIN $EXTRA_DOMAINS; do
  case " $NAMES " in *" $d "*) continue ;; esac   # skip duplicates (certbot rejects repeated -d)
  DOMAINS+=(-d "$d"); NAMES="$NAMES $d"
done
sed -e "s|__NAMES__|$NAMES|" "$APP_DIR/app/tencent/deploy/nginx.conf.tpl" > /etc/nginx/sites-available/pixelhoops
ln -sf /etc/nginx/sites-available/pixelhoops /etc/nginx/sites-enabled/pixelhoops
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
for d in $NAMES; do echo "DNS check: $d -> $(dig +short "$d" | tr '\n' ' ')   (this server: $PUBLIC_IP)"; done
# --cert-name pins one stable certificate; --expand lets a re-run add names to it instead of refusing in non-interactive mode.
# certbot --nginx also re-adds the 443 listener that the template rewrite above removes, so re-running is safe.
if certbot --nginx --non-interactive --agree-tos -m "$EMAIL" --redirect --expand --cert-name "$API_DOMAIN" "${DOMAINS[@]}"; then echo "TLS ok"; else
  echo "!! certbot failed: DNS must point to $PUBLIC_IP and be DNS-only (grey cloud) in Cloudflare. Re-run this script after fixing."; fi

say "8/8 firewall (host-level; ALSO open the same ports in the Lighthouse console firewall)"
ufw allow OpenSSH >/dev/null; ufw allow 80,443/tcp >/dev/null; ufw allow 3478/tcp >/dev/null; ufw allow 3478/udp >/dev/null
ufw allow "${TURN_MIN_PORT}:${TURN_MAX_PORT}/udp" >/dev/null
ufw --force enable >/dev/null

cat <<DONE

Done.
  health : https://$API_DOMAIN/api/health
  turn   : https://$API_DOMAIN/api/turn      (should return iceServers)
  stats  : https://$API_DOMAIN/api/stats
  logs   : journalctl -u pixelhoops -f       journalctl -u coturn -f
  data   : $APP_DIR/data/pixelhoops.db       backup: bash $APP_DIR/app/tencent/deploy/backup.sh

Console firewall (Lighthouse -> Firewall) must allow: TCP 22,80,443,3478  UDP 3478, ${TURN_MIN_PORT}-${TURN_MAX_PORT}
DONE
