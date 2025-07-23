# Mikrotik script to send heartbeat to monitoring service
# Replace 192.168.1.100 with your monitoring server IP or domain
# Adjust the port to match the value configured in Ajustes
# Replace YOUR_TOKEN with the token assigned to this device

:local ddns [/ip cloud get dns-name]
:local token "YOUR_TOKEN"

/tool fetch \
    url="http://192.168.1.100:4000/ping?cloud=$ddns" \
    http-header-field="X-Device-Token: $token" \
    keep-result=no
# Schedule every 5 minutes with:
# /system scheduler add name=heartbeat interval=5m on-event="/system script run heartbeat"
