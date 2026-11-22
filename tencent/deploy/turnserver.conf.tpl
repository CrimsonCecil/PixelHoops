# coturn for PixelHoops. Credentials are minted by the backend (GET /api/turn) using the shared secret.
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=__SECRET__
realm=__REALM__
__EXTERNAL_IP_LINE__
min-port=__MIN__
max-port=__MAX__
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
log-file=/var/log/turnserver.log
simple-log
