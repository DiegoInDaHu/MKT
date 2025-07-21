# Mikrotik script to send heartbeat to monitoring service
# Replace 192.168.1.100 with your monitoring server IP or domain
# Adjust the port to match the value configured in Ajustes
:local ddns [/ip cloud get dns-name]
# Replace YOURTOKEN with the token assigned to this device
/tool fetch url="https://192.168.1.100:4000/ping?cloud=$ddns&token=YOURTOKEN" keep-result=no
# Schedule every 5 minutes with:
# /system scheduler add name=heartbeat interval=5m on-event="/system script run heartbeat"
